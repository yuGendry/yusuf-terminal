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
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

import { FinalShader } from './shaders/FinalShader.js';
import { MotionBlurShader } from './shaders/MotionBlurShader.js';
import { SSAOShader, SSAOBlurShader } from './shaders/SSAOShader.js';
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

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.82);
    this.smaaPass = new SMAAPass(1, 1);

    // ---- motion blur reprojection state ------------------------------------
    this.prevViewProj = new THREE.Matrix4();
    this.currViewProj = new THREE.Matrix4();
    this.invViewProj = new THREE.Matrix4();
    this._hasPrev = false;

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
  }

  /** Re-read every quality setting. Called when a preset or toggle changes. */
  rebuild() {
    const s = Settings.all();
    this.enableSSAO = !!s.ssao;
    this.enableMotionBlur = !!s.motionBlur;
    this.enableBloom = !!s.bloom;
    this.aa = s.antialias;

    this.bloomPass.strength = s.bloomIntensity;
    this.bloomPass.radius = 0.55;
    this.bloomPass.threshold = 0.8;

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
    this.ldrRT.setSize(w, h);

    const aow = Math.max(1, Math.floor(w * (this._aoScale ?? 0.5)));
    const aoh = Math.max(1, Math.floor(h * (this._aoScale ?? 0.5)));
    this.aoRT.setSize(aow, aoh);
    this.aoBlurRT.setSize(aow, aoh);

    this.bloomPass.setSize(w, h);
    this.smaaPass.setSize(w, h);

    this.finalMat.uniforms.uResolution.value = [w, h];
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

    // ---- 1. scene -------------------------------------------------------
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

    // ---- 3. motion blur --------------------------------------------------
    camera.updateMatrixWorld();
    this.currViewProj
      .copy(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
    this.invViewProj.copy(this.currViewProj).invert();

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

    // ---- 4. bloom (blends additively into `current` in place) ------------
    if (this.enableBloom) {
      this.bloomPass.strength = s.bloomIntensity;
      this.bloomPass.renderToScreen = false;
      this.bloomPass.render(renderer, spare, current, dt, false);
    }

    // ---- 5. grade + 6. antialias ----------------------------------------
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
    for (const rt of [this.sceneRT, this.rtA, this.rtB, this.aoRT, this.aoBlurRT, this.ldrRT]) {
      rt.dispose();
    }
    this.sceneRT.depthTexture?.dispose();
    for (const m of [this.finalMat, this.motionMat, this.ssaoMat, this.ssaoBlurMat, this.fxaaMat]) {
      m.dispose();
    }
    this.bloomPass.dispose?.();
    this.smaaPass.dispose?.();
    this.quad.dispose();
  }
}
