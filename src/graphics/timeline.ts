export type TimelineStage =
  | "scene"
  | "environment"
  | "isolated"
  | "body"
  | "head";

/** All values are sampled from scroll alone; seeking backward requires no reset. */
export interface TimelineFrame {
  progress: number;
  stage: TimelineStage;
  cameraOrbit: number;
  environmentOpacity: number;
  bodyOpacity: number;
  headOpacity: number;
  bodyScale: number;
  reveal: number;
  /** Disjoint spatial groups, with overlapping animation windows for continuous flow. */
  upperEnvironment: number;
  circleRadius: number;
  cylinderLength: number;
}

export function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function interval(progress: number, start: number, end: number): number {
  const t = clamp01((progress - start) / (end - start));
  return t * t * (3 - 2 * t);
}

export function sampleTimeline(value: number): TimelineFrame {
  const p = clamp01(value);
  return {
    progress: p,
    stage:
      p < 0.22
        ? "scene"
        : p < 0.45
          ? "environment"
          : p < 0.58
            ? "isolated"
            : p < 0.85
              ? "body"
              : "head",
    cameraOrbit: interval(p, 0, 1) * 0.85,
    environmentOpacity: 1 - interval(p, 0.22, 0.45),
    bodyOpacity: 1 - interval(p, 0.58, 0.85),
    headOpacity: 1 - interval(p, 0.85, 1),
    bodyScale: 1 - interval(p, 0.58, 0.85) * 0.12,
    reveal: interval(p, 0.85, 1),
    // No separate ease-in/ease-out at the handoffs: particle lifetimes already
    // soften the edge. Overlap accounts for their tails and sparse outer geometry.
    upperEnvironment: 1 - clamp01(p / 0.36),
    circleRadius: 1 - clamp01((p - 0.16) / 0.48),
    cylinderLength: 1 - clamp01((p - 0.5) / 0.5),
  };
}
