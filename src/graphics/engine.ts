import { Raycaster, Scene, Vector2, WebGLRenderer } from "three";
import { CameraRig } from "./camera-rig";
import type { GraphicsContext, SceneLayer, Viewport } from "./scene-layer";
import { sampleTimeline } from "./timeline";
import { ParticleRibbon } from "./particle-ribbon";
import { StatueOrbit } from "../ui/statue-orbit";

export type GraphicsState = "loading" | "ready" | "lost" | "fallback";

export class GraphicsEngine {
  private renderer: WebGLRenderer | null = null;
  private ribbon: ParticleRibbon | null = null;
  private orbit: StatueOrbit | null = null;
  private orbiting = false;
  private readonly pick = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly scene = new Scene();
  private readonly rig = new CameraRig();
  private readonly abort = new AbortController();
  private readonly media = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  private readonly observer: ResizeObserver;
  private canvas: HTMLCanvasElement | null = null;
  private viewport: Viewport = { width: 1, height: 1, pixelRatio: 1 };
  private progress = 0;
  private frameId = 0;
  private lastTime = 0;
  private idleSeconds = 0;
  private paused = false;
  private ready = false;
  private lost = false;
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly layer: SceneLayer,
    private readonly onState: (
      state: GraphicsState,
      reducedMotion: boolean,
    ) => void,
  ) {
    this.observer = new ResizeObserver(this.resize);
  }

  private context(): GraphicsContext {
    if (!this.renderer) throw new Error("Renderer is unavailable");
    return {
      animationSeconds: this.media.matches ? 0 : this.idleSeconds,
      renderer: this.renderer,
      scene: this.scene,
      camera: this.rig.camera,
      signal: this.abort.signal,
      invalidate: this.invalidate,
      configureCamera: (pose) => this.rig.configure(pose),
    };
  }

  async initialize(): Promise<void> {
    this.report("loading");
    const canvas = document.createElement("canvas");
    this.canvas = canvas;
    try {
      const context = canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
      });
      if (!context) throw new Error("WebGL2 unavailable");
      this.renderer = new WebGLRenderer({
        canvas,
        context,
        alpha: true,
        antialias: false,
      });
      this.renderer.setClearColor(0x111411, 0);
      this.ribbon = new ParticleRibbon(this.invalidate);
      // Three.js installs its restoration listener first, before our layer hook.
      canvas.addEventListener("webglcontextlost", this.contextLost);
      canvas.addEventListener("webglcontextrestored", this.contextRestored);
      this.host.append(canvas);
      await this.layer.initialize(this.context());
      if (this.disposed) {
        this.layer.dispose();
        return;
      }
      this.ready = true;
      this.orbit = new StatueOrbit(
        (x, y) => {
          if (!this.ready || this.lost || this.disposed || x < this.viewport.width * 0.5) return false;
          this.pointer.set(x / this.viewport.width * 2 - 1, 1 - y / this.viewport.height * 2);
          this.pick.setFromCamera(this.pointer, this.rig.camera);
          return this.layer.hitTest?.(this.pick.ray) ?? false;
        },
        (dx, dy) => { this.rig.orbit(-dx, -dy); this.invalidate(); },
        value => {
          this.orbiting = value;
          this.host.dataset.orbiting = String(value);
          this.invalidate();
        },
      );
      this.observer.observe(this.host);
      window.addEventListener("resize", this.resize);
      document.addEventListener("visibilitychange", this.visibilityChanged);
      this.media.addEventListener("change", this.motionChanged);
      this.resize();
      this.report(this.lost ? "lost" : "ready");
      this.invalidate();
    } catch (error) {
      this.fail(error);
    }
  }

  setProgress(progress: number): void {
    this.progress = sampleTimeline(progress).progress;
    this.invalidate();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.lastTime = 0;
    this.invalidate();
  }

  private report(state: GraphicsState): void {
    this.host.dataset.state = state;
    this.onState(state, this.media.matches);
  }

  private resize = (): void => {
    if (!this.renderer || this.disposed || this.lost) return;
    this.viewport = {
      width: Math.max(1, this.host.clientWidth),
      height: Math.max(1, this.host.clientHeight),
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    };
    this.renderer.setPixelRatio(this.viewport.pixelRatio);
    this.renderer.setSize(this.viewport.width, this.viewport.height, false);
    this.rig.resize(this.viewport);
    this.layer.resize(this.viewport);
    this.ribbon?.resize(this.viewport);
    this.invalidate();
  };

  private invalidate = (): void => {
    if (
      !this.frameId &&
      this.ready &&
      !this.lost &&
      !this.disposed &&
      !document.hidden
    ) {
      this.frameId = requestAnimationFrame(this.render);
    }
  };

  private render = (time: number): void => {
    this.frameId = 0;
    if (
      !this.renderer ||
      !this.ready ||
      this.lost ||
      this.disposed ||
      document.hidden
    )
      return;
    const animated = !this.media.matches && !this.paused;
    if (animated && !this.orbiting && this.lastTime)
      this.idleSeconds += Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = animated ? time : 0;
    const frame = sampleTimeline(this.progress);
    try {
      this.rig.update(frame, this.idleSeconds, this.media.matches);
      this.layer.update(frame);
      this.layer.beforeRender?.(this.context());
      // Explicit passes avoid transparent-object sorting putting the ribbon over splats.
      const autoClear = this.renderer.autoClear;
      try {
        this.renderer.autoClear = false;
        this.renderer.clear();
        if (!this.orbiting) this.ribbon?.render(this.renderer, this.progress, this.media.matches ? 0 : this.idleSeconds);
        this.renderer.clearDepth();
        this.renderer.render(this.scene, this.rig.camera);
      } finally {
        this.renderer.autoClear = autoClear;
      }
    } catch (error) {
      this.fail(error);
      return;
    }
    // The ribbon keeps moving after the final splats disappear; pause still stops RAF.
    if (animated) this.invalidate();
  };

  private stop(): void {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.lastTime = 0;
  }

  private visibilityChanged = (): void => {
    this.stop();
    if (!document.hidden) this.invalidate();
  };

  private motionChanged = (): void => {
    this.stop();
    this.report(this.lost ? "lost" : "ready");
    this.invalidate();
  };

  private contextLost = (event: Event): void => {
    event.preventDefault();
    this.lost = true;
    this.stop();
    this.layer.contextLost();
    this.report("lost");
  };

  private contextRestored = async (): Promise<void> => {
    if (this.disposed || !this.renderer) return;
    if (!this.ready) {
      this.lost = false;
      return;
    }
    try {
      await this.layer.contextRestored(this.context());
      if (this.disposed) return;
      this.lost = false;
      this.resize();
      this.report("ready");
      this.invalidate();
    } catch (error) {
      this.fail(error);
    }
  };

  private fail(error: unknown): void {
    if (this.disposed) return;
    console.warn("Graphics unavailable; using the static background.", error);
    this.dispose();
    this.report("fallback");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    this.abort.abort();
    this.stop();
    this.observer.disconnect();
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    this.media.removeEventListener("change", this.motionChanged);
    this.canvas?.removeEventListener("webglcontextlost", this.contextLost);
    this.canvas?.removeEventListener(
      "webglcontextrestored",
      this.contextRestored,
    );
    this.layer.dispose();
    this.orbit?.dispose();
    this.orbit = null;
    this.ribbon?.dispose();
    this.ribbon = null;
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
    this.canvas?.remove();
  }
}
