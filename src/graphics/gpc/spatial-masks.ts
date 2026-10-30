import { Vector3 } from "three";
import { dyno } from "@sparkjsdev/spark";

/** Authored in original PLY/SOG coordinates, before the scene's 180° Z flip.
 * The capture's up direction is -Y. The pedestal is part of the statue mask.
 * Membership always uses this full cylinder, never its animated remaining length.
 */
export const STATUE_MASK = {
  base: [-2, 2.65, 5.4] as const,
  radius: 2,
  height: 5.05,
  upSign: -1,
};

/** Robust local terrain fit from the source capture: y = ax + bz + c.
 * A small allowance retains surface thickness and stones for the ground pass.
 */
export const GROUND_PLANE = { x: 0.04126, z: -0.05523, offset: 3.1313, tolerance: 0.28 };

export function createSpatialMasks(outerRadius: number, upperHeight = 80) {
  const upper = dyno.dynoFloat(1);
  const circle = dyno.dynoFloat(1);
  const cylinder = dyno.dynoFloat(1);
  const motion = dyno.dynoFloat(1);
  const accent = dyno.dynoVec3(new Vector3(196 / 255, 213 / 255, 165 / 255));
  const base = dyno.dynoVec3(new Vector3(...STATUE_MASK.base));
  const radius = dyno.dynoFloat(STATUE_MASK.radius);
  const height = dyno.dynoFloat(STATUE_MASK.height);
  const extent = dyno.dynoFloat(outerRadius);
  const ceiling = dyno.dynoFloat(upperHeight);
  const modifier = new dyno.Dyno({
    inTypes: {
      gsplat: dyno.Gsplat,
      upper: "float",
      circle: "float",
      cylinder: "float",
      motion: "float",
      accent: "vec3",
      base: "vec3",
      radius: "float",
      height: "float",
      extent: "float",
      ceiling: "float",
    },
    outTypes: { gsplat: dyno.Gsplat },
    inputs: { upper, circle, cylinder, motion, accent, base, radius, height, extent, ceiling },
    globals: () => [
      // Integer hashing keeps the variation stable across seeks and across frames.
      `float portfolioMaskHash(uint x) {
        x ^= x >> 16u; x *= 0x7feb352du;
        x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
        return float(x & 0x00ffffffu) / 16777216.0;
      }`,
    ],
    statements: ({ inputs: i, outputs: o }) => [
      `${o.gsplat} = ${i.gsplat};`,
      // All membership and activation calculations use the unmodified position.
      `vec3 relative = ${i.gsplat}.center - ${i.base};`,
      "float radialDistance = length(relative.xz);",
      `float altitude = relative.y * ${STATUE_MASK.upSign.toFixed(1)};`,
      `bool statue = radialDistance <= ${i.radius} && altitude >= 0.0 && altitude <= ${i.height};`,
      `float groundY = ${i.gsplat}.center.x * ${GROUND_PLANE.x} + ${i.gsplat}.center.z * ${GROUND_PLANE.z} + ${GROUND_PLANE.offset};`,
      `float aboveGround = groundY - ${i.gsplat}.center.y;`,
      `bool upperEnvironment = !statue && aboveGround > ${GROUND_PLANE.tolerance};`,
      "float phase; float order;",
      "if (statue) {",
      `  phase = 1.0 - ${i.cylinder};`,
      `  order = altitude / ${i.height};`,
      "} else if (upperEnvironment) {",
      `  phase = 1.0 - ${i.upper};`,
      // Log spacing prevents distant outliers consuming most of the scroll range.
      `  order = 1.0 - log(1.0 + max(0.0, aboveGround - ${GROUND_PLANE.tolerance})) / log(1.0 + ${i.ceiling});`,
      "} else {",
      `  phase = 1.0 - ${i.circle};`,
      `  order = 1.0 - log(1.0 + radialDistance) / log(1.0 + ${i.extent});`,
      "}",
      `uint seed = uint(${i.gsplat}.index);`,
      "vec3 random = vec3(portfolioMaskHash(seed), portfolioMaskHash(seed + 731u), portfolioMaskHash(seed + 1931u));",
      // Coherent spatial variation breaks up the sweep; per-splat jitter adds grain.
      "float edgeNoise = sin(dot(relative, vec3(3.1, 2.7, 4.3))) * sin(dot(relative, vec3(-2.2, 4.1, 1.7)));",
      "float onset = clamp(clamp(order, 0.0, 1.0) * 0.76 + edgeNoise * 0.025 + (random.x - 0.5) * 0.025, 0.0, 0.78);",
      // Every particle finishes within its own stage, including the final head.
      "float life = clamp((phase - onset) / 0.22, 0.0, 1.0);",
      `float morph = smoothstep(0.0, 0.3, life) * ${i.motion};`,
      `float originalScale = max(${i.gsplat}.scales.x, max(${i.gsplat}.scales.y, ${i.gsplat}.scales.z));`,
      "float particleSize = min(originalScale, mix(0.012, 0.032, random.y));",
      `${o.gsplat}.scales = mix(${i.gsplat}.scales, vec3(particleSize), morph) * (1.0 - 0.92 * smoothstep(0.35, 1.0, life));`,
      "vec2 outward = relative.xz / max(radialDistance, 0.001);",
      "float angle = random.z * 6.2831853 + life * 5.0;",
      "vec3 drift = vec3(outward.x * 0.55 + cos(angle) * 0.32, -1.1 - random.y * 0.6, outward.y * 0.55 + sin(angle) * 0.32);",
      `float travel = life * life * ${i.motion} * (statue ? 0.85 : 1.25);`,
      `${o.gsplat}.center += drift * travel;`,
      `float shimmer = sin(life * 3.14159265) * ${i.motion} * 0.7;`,
      `${o.gsplat}.rgba.rgb = mix(${i.gsplat}.rgba.rgb, ${i.accent}, shimmer);`,
      // A sparse population remains as dust after the initial breakup, avoiding a fog bank.
      `float dust = mix(1.0, random.x > 0.72 ? 1.0 : 0.0, smoothstep(0.15, 0.5, life) * ${i.motion});`,
      "float visibility = (1.0 - smoothstep(0.15, 1.0, life)) * dust;",
      "if (phase <= 0.0) visibility = 1.0;",
      "if (phase >= 1.0) visibility = 0.0;",
      `${o.gsplat}.rgba.a *= visibility;`,
    ],
  });
  return { modifier, upper, circle, cylinder, motion, accent };
}
