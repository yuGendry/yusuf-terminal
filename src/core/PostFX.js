/**
 * PostFX.js — the post-processing chain.
 *
 * This is a hand-rolled chain rather than three's EffectComposer. The reason is
 * the depth buffer: SSAO and motion blur both need the depth written by the
 * scene render, and EffectComposer's ping-pong targets share (and its shader
 * passes clobber) the attached DepthTexture. Owning the targets ourselves means
 * the scene renders into one target that keeps its depth for the whole frame,
 * and the colour ping-pongs around it.
 *
 * Chain:
 *   scene ──▶ [SSAO] ──▶ [motion blur] ──▶ [bloom] ──▶ grade ──▶ [SMAA/FXAA] ──▶ screen
 *                 └── both read sceneRT.depthTexture ──┘
 */

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

import { FinalShader } from './shaders/FinalShader.js';
import { MotionBlurShader } from './shaders/MotionBlurShader.js';
import { SSAOShader, SSAOBlurShader } from './shaders/SSAOShader.js';
import { TAAShader, JITTER } from './shaders/TAAShader.js';
import {
  BloomPrefilterShader, BloomDownShader, BloomUpShader, BloomCombineShader,
} from './shaders/BloomShader.js';
import { VolumetricShader, VolumetricCombineShader } from './shaders/VolumetricShader.js';
import { Settings } from './Settings.js';
import { clamp, damp } from '../util/MathUtil.js';

/** Shader passes must never write depth — sceneRT's depth has to survive. */
function makePassMaterial(shader) {
  return new THREE.ShaderMaterial({
    name: shader.name,
    uniforms: THREE.UniformsUtils.clone(shader.uniforms),
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
}

export class PostFX {
  constructor(engine) {
    this.engine = engine;
    this.renderer = engine.renderer;
    this.camera = engine.camera;
    this.scene = null;

    this.quad = new FullScreenQuad(null);

    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;

    // ---- render targets ----------------------------------------------------
    const hdr = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    };

    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, hdr);
    this.sceneRT.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.sceneRT.depthTexture.format = THREE.DepthFormat;
    this.sceneRT.depthTexture.minFilter = THREE.NearestFilter;
    this.sceneRT.depthTexture.magFilter = THREE.NearestFilter;

    this.rtA = new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: false });
    this.rtB = new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: false });

    // The TAA history, ping-ponged. Two buffers rather than one because a
    // pass cannot read and write the same texture: this frame resolves into
    // one while reading the other, and they swap. Kept out of the rtA/rtB
    // rotation on purpose — everything after TAA (motion blur, bloom) writes
    // into those, and the history has to stay the clean resolved image or it
    // accumulates its own blur, frame over frame, until the picture is soup.
    this.histA = new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: false });
    this.histB = new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: false });
    this._histIndex = 0;

    // AO is single-channel and tolerates half resolution; the bilateral blur
    // upsamples it cleanly enough that nobody notices.
    const aoOpts = {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.aoRT = new THREE.WebGLRenderTarget(1, 1, aoOpts);
    this.aoBlurRT = new THREE.WebGLRenderTarget(1, 1, aoOpts);

    this.ldrRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    // ---- pass materials ----------------------------------------------------
    this.finalMat = makePassMaterial(FinalShader);
    this.motionMat = makePassMaterial(MotionBlurShader);
    this.ssaoMat = makePassMaterial(SSAOShader);
    this.ssaoBlurMat = makePassMaterial(SSAOBlurShader);
    this.fxaaMat = makePassMaterial(FXAAShader);
    this.taaMat = makePassMaterial(TAAShader);

    this.smaaPass = new SMAAPass(1, 1);

    // ---- bloom chain -------------------------------------------------------
    this.bloomPrefilterMat = makePassMaterial(BloomPrefilterShader);
    this.bloomDownMat = makePassMaterial(BloomDownShader);
    this.bloomUpMat = makePassMaterial(BloomUpShader);
    this.bloomCombineMat = makePassMaterial(BloomCombineShader);
    // Additive, because each upsample adds itself to the level above.
    this.bloomUpMat.blending = THREE.AdditiveBlending;
    this.bloomUpMat.transparent = true;

    // ---- volumetrics -------------------------------------------------------
    this.volumeMat = makePassMaterial(VolumetricShader);
    this.volumeCombineMat = makePassMaterial(VolumetricCombineShader);
    this.volumeRT = new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: false });
    /**
     * The light the beam is marched from — the player's torch.
     *
     * One light, not all of them. Raymarching every practical in a room would
     * cost a multiple of the whole frame for something nobody looks at; the
     * torch is the one the player is aiming, the one that moves, and the only
     * one whose beam they are ever looking down.
     */
    this.volumetricLight = null;

    /** Six levels, allocated in setSize. The chain stops early on small windows. */
    this.bloomMips = [];
    this.BLOOM_LEVELS = 6;
    for (let i = 0; i < this.BLOOM_LEVELS; i++) {
      this.bloomMips.push(new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: false }));
    }

    // ---- motion blur reprojection state ------------------------------------
    this.prevViewProj = new THREE.Matrix4();
    this.currViewProj = new THREE.Matrix4();
    this.invViewProj = new THREE.Matrix4();
    this._hasPrev = false;

    /** Which of the 8 Halton offsets this frame uses. */
    this._jitterIndex = 0;
    /** Cleared by any cut, so the resolve does not blend across it. */
    this._taaReset = true;
    /**
     * How many times the history has been thrown away.
     *
     * Exposed because the cut detector fails silently by construction: if it
     * stops firing, nothing errors — you just get a frame of smear on every
     * cut, which is easy to mistake for the motion blur doing its job. A
     * counter is the only way a test can see it working, since the flag
     * itself is consumed by the resolve on the same frame it is set.
     */
    this.temporalResets = 0;
    this._prevCamPos = new THREE.Vector3();
    this._prevCamDir = new THREE.Vector3(0, 0, -1);
    this._camPos = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._lightPos = new THREE.Vector3();
    this._lightTarget = new THREE.Vector3();
    this._lightDir = new THREE.Vector3();

    /**
     * Effect state the game drives directly. Held separately from the shader
     * uniforms so gameplay code never touches GLSL, and so we can smooth the
     * values toward their targets instead of popping.
     */
    this.fx = {
      fade: 0,
      maskAmount: 0,
      strain: 0,
      damage: 0,
      distortion: 0,
      lensTint: new THREE.Color(1, 1, 1),
      saturation: 1,
      chromaBoost: 0,     // chases push this up
      /**
       * Added to the player's own vignette setting rather than replacing it.
       *
       * The vignette is a comfort preference — some people turn it right down
       * — so an effect that wants to close the frame in has to push it rather
       * than overwrite it, or being caught silently undoes a setting the
       * player chose.
       */
      vignetteBoost: 0,
      shakeTrauma: 0,
    };
    this._smoothed = { fade: 0, mask: 0, strain: 0, damage: 0, distortion: 0, chroma: 0 };

    this.rebuild();
  }

  setScene(scene) {
    this.scene = scene;
    this._hasPrev = false;
    this.resetTemporal();
  }

  /**
   * Throw away the accumulated history.
   *
   * Anything that moves the camera discontinuously has to call this — a
   * chapter load, a cinematic cut, a respawn, the jumpscare's snap. Without
   * it the first frame after the cut is blended 92% with the last frame of
   * somewhere else entirely, which looks exactly like a rendering fault.
   */
  resetTemporal() {
    if (!this._taaReset) this.temporalResets++;
    this._taaReset = true;
    this._hasPrev = false;
  }

  /** Re-read every quality setting. Called when a preset or toggle changes. */
  rebuild() {
    const s = Settings.all();
    this.enableSSAO = !!s.ssao;
    this.enableMotionBlur = !!s.motionBlur;
    this.enableBloom = !!s.bloom;
    this.aa = s.antialias;
    // TAA supersedes the spatial filters rather than stacking with them:
    // running SMAA over an already-resolved image only softens it.
    this.enableTAA = s.antialias === 'taa';
    this.enableVolumetrics = !!s.godRays;
    // Note the shape: 'low' is the special case and everything else falls
    // through to the high branch. Touching any slider sets the preset to
    // 'custom', so a ternary that tests for 'high' by name silently drops a
    // custom-quality player to the cheapest setting in the game.
    this.volumeMat.uniforms.uSteps.value =
      s.preset === 'low' ? 16 : s.preset === 'ultra' ? 40 : 28;
    // Half resolution normally; a quarter on low, where it is still readable
    // because the upsample tent hides the grid.
    this._volumeScale = s.preset === 'low' ? 0.25 : 0.5;
    this.taaMat.uniforms.uBlend.value = s.preset === 'low' ? 0.82 : 0.92;

    this.bloomCombineMat.uniforms.uStrength.value = s.bloomIntensity;
    this.bloomPrefilterMat.uniforms.uThreshold.value = 0.8;
    this.bloomPrefilterMat.uniforms.uKnee.value = 0.55;
    this.bloomUpMat.uniforms.uRadius.value = s.preset === 'low' ? 0.8 : 1.0;
    // Fewer levels on low: the widest two contribute the faintest skirt and
    // are the first thing worth giving up.
    this._bloomLevels = s.preset === 'low' ? 4 : this.BLOOM_LEVELS;

    this.motionMat.uniforms.uIntensity.value = s.motionBlurIntensity;
    this.motionMat.uniforms.uSamples.value =
      s.preset === 'ultra' ? 16 : s.preset === 'low' ? 6 : 10;

    this.ssaoMat.uniforms.uRadius.value = 0.55;
    this.ssaoMat.uniforms.uIntensity.value = s.preset === 'ultra' ? 1.05 : 0.9;

    this.finalMat.uniforms.uGrain.value = s.filmGrain ? s.filmGrainIntensity : 0;
    this.finalMat.uniforms.uChroma.value = s.chromaticAberration ? s.chromaticAberrationIntensity : 0;
    this.finalMat.uniforms.uVignette.value = s.vignetteIntensity;
    this.finalMat.uniforms.uBrightness.value = s.brightness;

    this._aoScale = s.preset === 'ultra' ? 1.0 : 0.5;
    this.setSize(this.width, this.height, this.pixelRatio);
  }

  setSize(width, height, pixelRatio) {
    if (!width || !height) return;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;

    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    this.bufferWidth = w;
    this.bufferHeight = h;

    this.sceneRT.setSize(w, h);
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
    this.histA.setSize(w, h);
    this.histB.setSize(w, h);
    // A resize invalidates every pixel of history.
    this._taaReset = true;
    this.ldrRT.setSize(w, h);

    const vw = Math.max(1, Math.floor(w * (this._volumeScale ?? 0.5)));
    const vh = Math.max(1, Math.floor(h * (this._volumeScale ?? 0.5)));
    this.volumeRT.setSize(vw, vh);
    this.volumeMat.uniforms.uResolution.value = [vw, vh];
    this.volumeCombineMat.uniforms.uTexel.value = [1 / vw, 1 / vh];

    const aow = Math.max(1, Math.floor(w * (this._aoScale ?? 0.5)));
    const aoh = Math.max(1, Math.floor(h * (this._aoScale ?? 0.5)));
    this.aoRT.setSize(aow, aoh);
    this.aoBlurRT.setSize(aow, aoh);

    this.smaaPass.setSize(w, h);

    // The chain halves each step, starting at half resolution. It stops when
    // a level would be smaller than 2px, so a very small window does not end
    // up with degenerate 1x1 mips whose filter taps all land on one texel.
    this._bloomActive = 0;
    for (let i = 0; i < this.BLOOM_LEVELS; i++) {
      const mw = Math.floor(w / Math.pow(2, i + 1));
      const mh = Math.floor(h / Math.pow(2, i + 1));
      if (mw < 2 || mh < 2) break;
      this.bloomMips[i].setSize(mw, mh);
      this._bloomActive = i + 1;
    }

    this.finalMat.uniforms.uResolution.value = [w, h];
    this.taaMat.uniforms.uTexel.value = [1 / w, 1 / h];
    this.motionMat.uniforms.uResolution.value = [w, h];
    this.ssaoMat.uniforms.uResolution.value = [aow, aoh];
    this.ssaoBlurMat.uniforms.uResolution.value = [aow, aoh];
    this.fxaaMat.uniforms.resolution.value.set(1 / w, 1 / h);
  }

  /** Draw a fullscreen quad with `material` into `target` (null = screen). */
  _blit(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear(true, false, false);
    this.quad.render(this.renderer);
  }

  render(dt) {
    const renderer = this.renderer;
    const camera = this.engine.camera;
    const s = Settings.all();

    // ---- smooth the gameplay-driven effect values ------------------------
    const sm = this._smoothed;
    sm.fade = damp(sm.fade, this.fx.fade, 9, dt);   // signed: -1 white … +1 black
    sm.mask = damp(sm.mask, this.fx.maskAmount, 11, dt);
    sm.strain = damp(sm.strain, this.fx.strain, 4, dt);
    sm.damage = damp(sm.damage, this.fx.damage, 6, dt);
    sm.distortion = damp(sm.distortion, this.fx.distortion, 8, dt);
    sm.chroma = damp(sm.chroma, this.fx.chromaBoost, 5, dt);

    const f = this.finalMat.uniforms;
    f.uTime.value = this.engine.elapsed;
    f.uFade.value = sm.fade;
    f.uMask.value = sm.mask;
    f.uStrain.value = sm.strain;
    f.uDamage.value = sm.damage;
    f.uDistortion.value = sm.distortion;
    f.uSaturation.value = this.fx.saturation;
    f.uBrightness.value = s.brightness;
    f.uVignette.value = s.vignetteIntensity + this.fx.vignetteBoost;
    f.uGrain.value = s.filmGrain ? s.filmGrainIntensity : 0;
    f.uChroma.value = s.chromaticAberration
      ? s.chromaticAberrationIntensity * (1 + sm.chroma * 2)
      : 0;
    f.uLensTint.value = [this.fx.lensTint.r, this.fx.lensTint.g, this.fx.lensTint.b];

    // ---- did the camera cut? ---------------------------------------------
    //
    // Detected rather than announced. Every discontinuity — a chapter load, a
    // cinematic cut, a respawn, the jumpscare's snap onto a face — would
    // otherwise blend the first frame of the new shot 92% with the last frame
    // of the old one, which reads as a rendering fault rather than as an edit.
    // Sniffing it here catches all of them, including the ones added later by
    // somebody who has never heard of this buffer.
    //
    // The thresholds are well clear of anything a player can do: sprinting is
    // about 6 m/s, so a 2-metre step in one frame means a teleport, and a
    // 40-degree snap is a dozen times a fast mouse flick at 60fps.
    camera.getWorldPosition(this._camPos);
    camera.getWorldDirection(this._camDir);
    if (this._hasPrev) {
      const jumped = this._camPos.distanceToSquared(this._prevCamPos) > 4;
      const spun = this._camDir.dot(this._prevCamDir) < 0.766;   // cos 40 degrees
      if ((jumped || spun) && !this._taaReset) {
        this._taaReset = true;
        this.temporalResets++;
      }
    }
    this._prevCamPos.copy(this._camPos);
    this._prevCamDir.copy(this._camDir);

    // ---- reprojection matrices, UNjittered -------------------------------
    //
    // Built before the jitter goes on, and used by both TAA and motion blur.
    // They have to describe where the camera really is: reprojecting through
    // a jittered matrix would fold the sub-pixel offset into the world
    // position and the history would chase its own tail.
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    this.currViewProj
      .copy(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
    this.invViewProj.copy(this.currViewProj).invert();

    // ---- 1. scene -------------------------------------------------------
    //
    // The jitter is a sub-pixel shift of the projection's centre, written
    // straight into the matrix rather than going through setViewOffset —
    // which rebuilds the matrix and would undo itself. Elements 8 and 9 are
    // the x and y offsets in clip space, so a shift of one pixel is two
    // clip units over the buffer width.
    if (this.enableTAA) {
      const [jx, jy] = JITTER[this._jitterIndex % JITTER.length];
      this._jitterIndex++;
      camera.projectionMatrix.elements[8] += (jx * 2) / this.bufferWidth;
      camera.projectionMatrix.elements[9] += (jy * 2) / this.bufferHeight;
      // SSAO unprojects through this, so it has to agree with what was drawn.
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }

    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(this.scene, camera);

    let current = this.sceneRT;
    let spare = this.rtA;

    const swap = (justWrote) => {
      // Never hand sceneRT back as a write target: its depth is still needed.
      const next = justWrote === this.rtA ? this.rtB : this.rtA;
      current = justWrote;
      spare = next;
    };

    // ---- 2. SSAO --------------------------------------------------------
    if (this.enableSSAO) {
      camera.updateMatrixWorld();
      const ao = this.ssaoMat.uniforms;
      ao.tDepth.value = this.sceneRT.depthTexture;
      ao.uProjection.value = camera.projectionMatrix;
      ao.uInvProjection.value = camera.projectionMatrixInverse;
      ao.uNear.value = camera.near;
      ao.uFar.value = camera.far;
      this._blit(this.ssaoMat, this.aoRT);

      const b = this.ssaoBlurMat.uniforms;
      b.tDepth.value = this.sceneRT.depthTexture;

      // horizontal, AO only
      b.tAO.value = this.aoRT.texture;
      b.uDirection.value = [1, 0];
      b.uComposite.value = 0;
      b.uResolution.value = [this.aoRT.width, this.aoRT.height];
      this._blit(this.ssaoBlurMat, this.aoBlurRT);

      // vertical + composite onto the lit colour, at full resolution
      b.tAO.value = this.aoBlurRT.texture;
      b.tDiffuse.value = current.texture;
      b.uDirection.value = [0, 1];
      b.uComposite.value = 1;
      b.uResolution.value = [this.aoBlurRT.width, this.aoBlurRT.height];
      this._blit(this.ssaoBlurMat, spare);
      swap(spare);
    }

    // ---- 2.5 volumetrics --------------------------------------------------
    //
    // Before TAA on purpose: the march is deliberately under-sampled and
    // dithered, and the temporal filter cleans up what is left for free. That
    // is what lets the step count be as low as it is.
    const vl = this.volumetricLight;
    if (this.enableVolumetrics && vl && vl.visible && vl.intensity > 0.001) {
      vl.updateMatrixWorld();
      vl.target.updateMatrixWorld();

      const u = this.volumeMat.uniforms;
      u.tDepth.value = this.sceneRT.depthTexture;
      u.uInvViewProj.value = this.invViewProj;

      this._camPos.setFromMatrixPosition(camera.matrixWorld);
      u.uCameraPos.value = [this._camPos.x, this._camPos.y, this._camPos.z];

      this._lightPos.setFromMatrixPosition(vl.matrixWorld);
      this._lightTarget.setFromMatrixPosition(vl.target.matrixWorld);
      this._lightDir.subVectors(this._lightTarget, this._lightPos).normalize();

      u.uLightPos.value = [this._lightPos.x, this._lightPos.y, this._lightPos.z];
      u.uLightDir.value = [this._lightDir.x, this._lightDir.y, this._lightDir.z];
      u.uLightColor.value = [vl.color.r, vl.color.g, vl.color.b];
      u.uLightIntensity.value = vl.intensity;
      u.uLightRange.value = vl.distance || 26;

      // three stores the half-angle; penumbra widens the inner cone inward.
      const outer = Math.cos(vl.angle);
      u.uCosOuter.value = outer;
      u.uCosInner.value = Math.cos(vl.angle * (1 - (vl.penumbra ?? 0.4) * 0.9));

      const shadowMap = vl.shadow?.map?.texture ?? null;
      u.tShadow.value = shadowMap;
      u.uShadowMatrix.value = vl.shadow?.matrix ?? null;
      u.uHasShadow.value = shadowMap && vl.castShadow ? 1 : 0;
      u.uTime.value = this.engine.elapsed;

      this._blit(this.volumeMat, this.volumeRT);

      this.volumeCombineMat.uniforms.tDiffuse.value = current.texture;
      this.volumeCombineMat.uniforms.tVolume.value = this.volumeRT.texture;
      this._blit(this.volumeCombineMat, spare);
      swap(spare);
    }

    // ---- 3. temporal resolve ---------------------------------------------
    //
    // Before motion blur and bloom, so the history stays the clean image.
    if (this.enableTAA) {
      const histRead = this._histIndex === 0 ? this.histA : this.histB;
      const histWrite = this._histIndex === 0 ? this.histB : this.histA;

      const t = this.taaMat.uniforms;
      t.tDiffuse.value = current.texture;
      t.tHistory.value = histRead.texture;
      t.tDepth.value = this.sceneRT.depthTexture;
      t.uInvViewProj.value = this.invViewProj;
      t.uPrevViewProj.value = this.prevViewProj;
      t.uFirst.value = (this._taaReset || !this._hasPrev) ? 1 : 0;

      this._blit(this.taaMat, histWrite);

      current = histWrite;
      this._histIndex ^= 1;
      this._taaReset = false;
    }

    // ---- 4. motion blur --------------------------------------------------
    if (this.enableMotionBlur && this._hasPrev) {
      const m = this.motionMat.uniforms;
      m.tDiffuse.value = current.texture;
      m.tDepth.value = this.sceneRT.depthTexture;
      m.uInvViewProj.value = this.invViewProj;
      m.uPrevViewProj.value = this.prevViewProj;
      m.uIntensity.value = s.motionBlurIntensity;
      this._blit(this.motionMat, spare);
      swap(spare);
    }
    this.prevViewProj.copy(this.currViewProj);
    this._hasPrev = true;

    // ---- 5. bloom --------------------------------------------------------
    //
    // Prefilter into the first mip, walk down the chain, then walk back up
    // adding each level onto the one above. The result in mip 0 is every
    // scale of spread summed at once, which is why a filament ends up with a
    // tight core and a very wide faint skirt instead of one fixed halo.
    const levels = Math.min(this._bloomLevels ?? this.BLOOM_LEVELS, this._bloomActive);
    if (this.enableBloom && levels > 0) {
      this.bloomCombineMat.uniforms.uStrength.value = s.bloomIntensity;

      this.bloomPrefilterMat.uniforms.tDiffuse.value = current.texture;
      this._blit(this.bloomPrefilterMat, this.bloomMips[0]);

      for (let i = 1; i < levels; i++) {
        const src = this.bloomMips[i - 1];
        this.bloomDownMat.uniforms.tDiffuse.value = src.texture;
        this.bloomDownMat.uniforms.uTexel.value = [1 / src.width, 1 / src.height];
        this._blit(this.bloomDownMat, this.bloomMips[i]);
      }

      for (let i = levels - 1; i > 0; i--) {
        const src = this.bloomMips[i];
        this.bloomUpMat.uniforms.tDiffuse.value = src.texture;
        this.bloomUpMat.uniforms.uTexel.value = [1 / src.width, 1 / src.height];
        // Additive onto the larger level, so it must NOT be cleared first.
        this.quad.material = this.bloomUpMat;
        renderer.setRenderTarget(this.bloomMips[i - 1]);
        this.quad.render(renderer);
      }

      this.bloomCombineMat.uniforms.tDiffuse.value = current.texture;
      this.bloomCombineMat.uniforms.tBloom.value = this.bloomMips[0].texture;
      this._blit(this.bloomCombineMat, spare);
      swap(spare);
    }

    // ---- 6. grade + 7. spatial antialias ---------------------------------
    f.tDiffuse.value = current.texture;
    const useAA = this.aa === 'smaa' || this.aa === 'fxaa';

    if (!useAA) {
      this._blit(this.finalMat, null);
    } else {
      this._blit(this.finalMat, this.ldrRT);
      if (this.aa === 'smaa') {
        this.smaaPass.renderToScreen = true;
        this.smaaPass.render(renderer, null, this.ldrRT, dt, false);
      } else {
        this.fxaaMat.uniforms.tDiffuse.value = this.ldrRT.texture;
        this._blit(this.fxaaMat, null);
      }
    }

    renderer.setRenderTarget(null);
  }

  /**
   * Transition fade. Signed: +1 is fully black, -1 is fully white.
   * The white end is used by the Veilmask overload, which flares rather than
   * cuts to black.
   */
  setFade(v) {
    this.fx.fade = clamp(v, -1, 1);
  }

  dispose() {
    for (const rt of [this.sceneRT, this.rtA, this.rtB, this.histA, this.histB,
                      this.aoRT, this.aoBlurRT, this.ldrRT, this.volumeRT]) {
      rt.dispose();
    }
    this.sceneRT.depthTexture?.dispose();
    for (const m of [this.finalMat, this.motionMat, this.ssaoMat, this.ssaoBlurMat,
                     this.fxaaMat, this.taaMat, this.volumeMat, this.volumeCombineMat]) {
      m.dispose();
    }
    this.smaaPass.dispose?.();
    for (const m of this.bloomMips) m.dispose();
    for (const m of [this.bloomPrefilterMat, this.bloomDownMat,
                     this.bloomUpMat, this.bloomCombineMat]) m.dispose();
    this.quad.dispose();
  }
}
