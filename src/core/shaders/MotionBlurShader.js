/**
 * MotionBlurShader — camera-velocity motion blur by depth reprojection.
 *
 * Rather than rendering a separate velocity buffer (an extra full scene pass),
 * we reconstruct each pixel's world position from the depth buffer we already
 * have, project it with the *previous* frame's view-projection matrix, and blur
 * along the resulting screen-space delta. This only captures camera motion, not
 * object motion, which is exactly what we want here: it smears the world when
 * the player whips the mouse around during a chase, and costs one pass.
 */

export const MotionBlurShader = {
  name: 'MotionBlurShader',

  uniforms: {
    tDiffuse:            { value: null },
    tDepth:              { value: null },
    uInvViewProj:        { value: null },   // current frame, NDC -> world
    uPrevViewProj:       { value: null },   // previous frame, world -> NDC
    uIntensity:          { value: 0.55 },
    uSamples:            { value: 10 },
    uMaxVelocity:        { value: 0.045 },  // in UV units, clamps wild spins
    uResolution:         { value: [1920, 1080] },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tDiffuse;
    uniform highp sampler2D tDepth;
    uniform mat4  uInvViewProj;
    uniform mat4  uPrevViewProj;
    uniform float uIntensity;
    uniform int   uSamples;
    uniform float uMaxVelocity;
    uniform vec2  uResolution;

    varying vec2 vUv;

    void main() {
      float depth = texture2D(tDepth, vUv).x;
      vec4 base = texture2D(tDiffuse, vUv);

      // Skybox / cleared background: nothing to reproject, and blurring it
      // produces a smeared halo around silhouettes.
      if (depth >= 0.9999) {
        gl_FragColor = base;
        return;
      }

      // Depth buffer -> world space.
      vec4 ndc = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 world = uInvViewProj * ndc;
      world /= world.w;

      // World space -> previous frame's screen position.
      vec4 prevClip = uPrevViewProj * world;
      if (prevClip.w <= 0.0) {
        gl_FragColor = base;
        return;
      }
      vec2 prevUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;

      vec2 velocity = (vUv - prevUv) * uIntensity;

      float len = length(velocity);
      if (len < 0.0008) {
        gl_FragColor = base;
        return;
      }
      if (len > uMaxVelocity) velocity *= uMaxVelocity / len;

      // Dither the sample start so low sample counts band into noise (which the
      // film grain hides) rather than into visible ghost steps.
      float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

      vec4 sum = base;
      float weight = 1.0;
      for (int i = 1; i < 24; i++) {
        if (i >= uSamples) break;
        float t = (float(i) + jitter) / float(uSamples);
        vec2 offset = velocity * (t - 0.5);
        vec2 sampleUv = vUv + offset;
        if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;

        // Reject samples that are much closer to the camera: without this, a
        // foreground object bleeds its colour over a static background.
        float sd = texture2D(tDepth, sampleUv).x;
        float w = (sd < depth - 0.0015) ? 0.25 : 1.0;

        sum += texture2D(tDiffuse, sampleUv) * w;
        weight += w;
      }

      gl_FragColor = sum / weight;
    }
  `,
};
