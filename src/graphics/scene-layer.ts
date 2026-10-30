import type { Camera, Scene, WebGLRenderer } from "three";
import type { TimelineFrame } from "./timeline";

export interface Viewport {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface GraphicsContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  /** Aborted when the application is disposed, including during asset loading. */
  signal: AbortSignal;
  /** Schedule a host frame after asynchronous decoding/sorting changes. */
  invalidate: () => void;
  configureCamera: (pose: CameraPose) => void;
}

/**
 * Adapter boundary for a separately supplied renderer. Implementations share the
 * host canvas/context, own their GPU resources, and must not run their own loop.
 * No file format, decoder, sorting strategy, or proprietary API is specified.
 */
export interface SceneLayer {
  initialize(context: GraphicsContext): void | Promise<void>;
  update(frame: Readonly<TimelineFrame>): void;
  resize(viewport: Readonly<Viewport>): void;
  contextLost(): void;
  contextRestored(context: GraphicsContext): void | Promise<void>;
  /** Optional pass before the host renders its Three.js scene; restore GL state. */
  beforeRender?(context: GraphicsContext): void;
  dispose(): void;
}
