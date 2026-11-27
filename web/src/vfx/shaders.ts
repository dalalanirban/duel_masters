import * as THREE from 'three';

const QUAD_VERTEX_SHADER = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SUMMON_PORTAL_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform float uOpacity;
uniform vec3 uPrimaryColor;
uniform vec3 uSecondaryColor;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 centered = (vUv - 0.5) * 2.0;
  float r = length(centered);
  if (r > 1.0) discard;

  float angle = atan(centered.y, centered.x);
  float spinA = angle + uTime * 3.2;
  float spinB = angle - uTime * 4.5;

  // Dual counter-rotating magic rings
  float outerRing = exp(-pow((r - 0.84) * 18.0, 2.0));
  float midRing = exp(-pow((r - 0.56) * 22.0, 2.0));
  float innerCore = exp(-r * r * 5.2) * (1.0 - smoothstep(0.6, 1.0, uProgress));

  // Geometric hex & rune spokes
  float runesOuter = 0.5 + 0.5 * cos(spinA * 6.0);
  float runesInner = 0.5 + 0.5 * cos(spinB * 12.0);
  float spokeGlow = exp(-pow((r - 0.7) * 12.0, 2.0)) * smoothstep(0.25, 0.95, runesOuter);

  // Expanding shockwave pulse
  float waveR = clamp(uProgress * 1.15, 0.05, 0.96);
  float shockwave = exp(-pow((r - waveR) * 16.0, 2.0)) * (1.0 - uProgress);

  float intensity =
    outerRing * (0.65 + 0.45 * runesOuter) +
    midRing * (0.55 + 0.45 * runesInner) +
    spokeGlow * 0.75 +
    innerCore * 0.95 +
    shockwave * 1.1;

  float radialMask = 1.0 - smoothstep(0.86, 1.0, r);
  float alpha = clamp(intensity * radialMask * uOpacity, 0.0, 1.0);
  vec3 color = mix(uSecondaryColor, uPrimaryColor, clamp(outerRing + spokeGlow, 0.0, 1.0));
  color += vec3(1.0, 0.97, 0.9) * (innerCore * 0.5 + shockwave * 0.45);

  fragColor = vec4(color * alpha, alpha);
}
`;

const ENERGY_BEAM_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform float uOpacity;
uniform vec3 uPrimaryColor;
uniform vec3 uSecondaryColor;

in vec2 vUv;
out vec4 fragColor;

void main() {
  // vUv.x runs from source (0) to target (1); vUv.y is cross-section (0..1)
  float crossDist = abs(vUv.y - 0.5) * 2.0;

  // Taper beam thickness at endpoints & scroll energy ripples along beam length
  float endTaper = smoothstep(0.0, 0.14, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));
  float wave = sin(vUv.x * 26.0 - uTime * 28.0) * 0.08 + sin(vUv.x * 48.0 - uTime * 40.0) * 0.04;
  float warpedDist = clamp(crossDist + wave * (1.0 - crossDist), 0.0, 1.0);

  float core = 1.0 - smoothstep(0.04, 0.28, warpedDist);
  float aura = 1.0 - smoothstep(0.15, 0.95, warpedDist);

  // Leading strike packet rushing 0 -> 1 early in beat
  float headPos = clamp(uProgress * 1.45, 0.0, 1.15);
  float boltMask = 1.0 - smoothstep(headPos - 0.15, headPos + 0.06, vUv.x);

  float alpha = clamp((aura * 0.75 + core * 1.15) * endTaper * boltMask * uOpacity, 0.0, 1.0);
  vec3 col = mix(uSecondaryColor, uPrimaryColor, clamp(aura + 0.3, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.98, 0.94), core * 0.85);

  fragColor = vec4(col * alpha, alpha);
}
`;

const FRESNEL_SHIELD_VERTEX_SHADER = /* glsl */ `
out vec3 vNormalDir;
out vec3 vViewDir;
out vec2 vUv;

void main() {
  vUv = uv;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vNormalDir = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;

const FRESNEL_SHIELD_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform float uOpacity;
uniform vec3 uPrimaryColor;
uniform vec3 uSecondaryColor;

in vec3 vNormalDir;
in vec3 vViewDir;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 n = normalize(vNormalDir);
  vec3 v = normalize(vViewDir);
  float ndotv = clamp(abs(dot(n, v)), 0.0, 1.0);
  float fresnel = pow(1.0 - ndotv, 2.2);

  // Faceted crystalline specular highlight from top-left key direction
  vec3 keyDir = normalize(vec3(-0.4, 0.75, 0.55));
  float facetSpec = pow(clamp(dot(reflect(-keyDir, n), v), 0.0, 1.0), 16.0);

  // Fracture shimmer pulse
  float scan = 0.5 + 0.5 * sin(vUv.y * 18.0 + uTime * 14.0);
  float flash = (1.0 - smoothstep(0.0, 0.35, uProgress)) * 0.45;

  vec3 baseCol = mix(uSecondaryColor, uPrimaryColor, clamp(fresnel + 0.25, 0.0, 1.0));
  vec3 finalCol = baseCol + vec3(0.92, 0.98, 1.0) * (facetSpec * 0.85 + fresnel * 0.55 + flash);
  float alpha = clamp((0.22 + fresnel * 0.72 + facetSpec * 0.4 + scan * 0.08) * uOpacity, 0.0, 1.0);

  fragColor = vec4(finalCol * alpha, alpha);
}
`;

const PARTICLE_VERTEX_SHADER = /* glsl */ `
uniform float uPixelRatio;

in float aSize;
in float aAlpha;
in vec3 aColor;

out float vAlpha;
out vec3 vColor;

void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  gl_PointSize = clamp(aSize * uPixelRatio, 1.0, 64.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
in float vAlpha;
in vec3 vColor;
out vec4 fragColor;

void main() {
  if (vAlpha <= 0.002) discard;
  vec2 d = gl_PointCoord - vec2(0.5);
  float dist = length(d) * 2.0;
  if (dist > 1.0) discard;

  float glow = exp(-dist * dist * 4.5);
  float core = 1.0 - smoothstep(0.05, 0.42, dist);
  vec3 col = mix(vColor, vec3(1.0, 0.98, 0.92), core * 0.7);
  float alpha = clamp(glow * vAlpha, 0.0, 1.0);

  fragColor = vec4(col * alpha, alpha);
}
`;

export function createSummonPortalMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 1 },
      uPrimaryColor: { value: new THREE.Color('#f97316') },
      uSecondaryColor: { value: new THREE.Color('#fbbf24') }
    },
    vertexShader: QUAD_VERTEX_SHADER,
    fragmentShader: SUMMON_PORTAL_FRAGMENT_SHADER
  });
}

export function createEnergyBeamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 1 },
      uPrimaryColor: { value: new THREE.Color('#f97316') },
      uSecondaryColor: { value: new THREE.Color('#ef4444') }
    },
    vertexShader: QUAD_VERTEX_SHADER,
    fragmentShader: ENERGY_BEAM_FRAGMENT_SHADER
  });
}

export function createFresnelShieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 1 },
      uPrimaryColor: { value: new THREE.Color('#38bdf8') },
      uSecondaryColor: { value: new THREE.Color('#fbbf24') }
    },
    vertexShader: FRESNEL_SHIELD_VERTEX_SHADER,
    fragmentShader: FRESNEL_SHIELD_FRAGMENT_SHADER
  });
}

export function createParticleGlowMaterial(pixelRatio: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uPixelRatio: { value: pixelRatio }
    },
    vertexShader: PARTICLE_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER
  });
}
