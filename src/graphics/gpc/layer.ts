import { Group } from "three";
import {
  PackedSplats,
  SparkRenderer,
  SplatFileType,
  SplatMesh,
} from "@sparkjsdev/spark";
import type { GraphicsContext, SceneLayer, Viewport } from "../scene-layer";
import type { TimelineFrame } from "../timeline";
import { openGpcStream } from "./stream";
import { createSpatialMasks, GROUND_PLANE, STATUE_MASK } from "./spatial-masks";
import { subscribeTheme } from "../../theme";

interface SceneManifest {
  format?: "gpc" | "sog";
  url: string;
  count: number;
  center: number[];
  radius: number;
  bounds?: [number[], number[]];
  camera?: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(new DOMException("Scene loading cancelled", "AbortError"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

export class GpcSceneLayer implements SceneLayer {
  private readonly root = new Group();
  private mesh?: SplatMesh;
  private splats?: PackedSplats;
  private spark?: SparkRenderer;
  private cancelLoad?: () => void;
  private disposed = false;
  private frame?: Readonly<TimelineFrame>;
  private masks?: ReturnType<typeof createSpatialMasks>;
  private canvas?: HTMLCanvasElement;
  private unsubscribeTheme?: () => void;
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor(
    private readonly manifestUrl: string,
    private readonly progress: (message: string) => void,
  ) {}

  async initialize(context: GraphicsContext): Promise<void> {
    const response = await fetch(this.manifestUrl, { signal: context.signal });
    if (!response.ok)
      throw new Error(`Scene manifest unavailable: ${response.status}`);
    const manifest = (await response.json()) as SceneManifest;
    if (
      !Number.isFinite(manifest.radius) ||
      manifest.radius <= 0 ||
      manifest.center.length !== 3 ||
      !manifest.center.every(Number.isFinite)
    )
      throw new Error("Invalid scene framing");
    if (manifest.format === "sog") {
      this.progress("Downloading SOG…");
      const response = await fetch(
        new URL(manifest.url, this.manifestUrl).href,
        { signal: context.signal },
      );
      if (!response.ok)
        throw new Error(`SOG request failed: ${response.status}`);
      const fileBytes = await response.arrayBuffer();
      this.progress("Decoding SOG…");
      this.splats = new PackedSplats({
        fileBytes,
        fileType: SplatFileType.PCSOGSZIP,
        fileName: manifest.url,
        lod: false,
      });
    } else {
      const decoded = await openGpcStream(
        new URL(manifest.url, this.manifestUrl).href,
        context.signal,
        (count, total) => {
          this.progress(
            `Loading statue · ${Math.round((count / total) * 100)}% decoded`,
          );
        },
      );
      this.cancelLoad = decoded.cancel;
      if (decoded.header.count !== manifest.count) {
        decoded.cancel();
        throw new Error("Scene manifest count mismatch");
      }
      this.splats = new PackedSplats({
        stream: decoded.stream,
        streamLength: decoded.streamLength,
        fileType: SplatFileType.PLY,
        fileName: "decoded-gpc.ply",
        lod: false,
      });
    }
    await untilAborted(this.splats.initialized, context.signal);
    if (this.splats.getNumSplats() !== manifest.count)
      throw new Error("Renderer splat count mismatch");
    context.renderer.domElement.dataset.splatCount = String(
      this.splats.getNumSplats(),
    );
    if (this.disposed || context.signal.aborted) {
      this.splats.dispose();
      return;
    }
    this.mesh = new SplatMesh({
      packedSplats: this.splats,
      raycastable: false,
      enableLod: false,
    });
    await untilAborted(this.mesh.initialized, context.signal);
    if (this.disposed || context.signal.aborted) {
      this.mesh.dispose();
      return;
    }
    const bounds = manifest.bounds;
    const box = bounds ? undefined : this.mesh.getBoundingBox(true);
    const min = bounds?.[0] ?? box!.min.toArray();
    const max = bounds?.[1] ?? box!.max.toArray();
    const outerRadius = Math.hypot(
      Math.max(Math.abs(min[0] - STATUE_MASK.base[0]), Math.abs(max[0] - STATUE_MASK.base[0])),
      Math.max(Math.abs(min[2] - STATUE_MASK.base[2]), Math.abs(max[2] - STATUE_MASK.base[2])),
    );
    const highestGround = Math.max(min[0] * GROUND_PLANE.x, max[0] * GROUND_PLANE.x)
      + Math.max(min[2] * GROUND_PLANE.z, max[2] * GROUND_PLANE.z)
      + GROUND_PLANE.offset;
    this.masks = createSpatialMasks(outerRadius, Math.max(1, highestGround - min[1]));
    this.mesh.objectModifier = this.masks.modifier;
    this.mesh.updateGenerator();
    this.canvas = context.renderer.domElement;
    this.unsubscribeTheme = subscribeTheme(theme => {
      const [r, g, b] = theme.tones.accent;
      this.masks!.accent.value.set(r / 255, g / 255, b / 255);
      this.mesh!.needsUpdate = true;
      context.invalidate();
    });
    // Frame the capture using the codec's bounded 1–99 percentile estimate.
    // No pruning, downsampling, or conversion of the stored geometry.
    const scale = 2.6 / manifest.radius;
    this.mesh.position.set(
      -manifest.center[0],
      -manifest.center[1],
      -manifest.center[2],
    );
    this.root.add(this.mesh);
    this.root.scale.setScalar(scale);
    // Match SuperSplat/PlayCanvas's PLY convention: 180° about Z.
    this.root.rotation.z = Math.PI;
    if (manifest.camera) {
      const transform = (point: number[]): [number, number, number] => [
        (point[0] + manifest.center[0]) * scale,
        (point[1] + manifest.center[1]) * scale,
        (point[2] - manifest.center[2]) * scale,
      ];
      context.configureCamera({
        position: transform(manifest.camera.position),
        target: transform(manifest.camera.target),
        fov: manifest.camera.fov,
      });
    }
    this.createRenderer(context);
    context.scene.add(this.root);
    if (this.frame) this.update(this.frame);
    this.progress(
      `Statue ready · ${manifest.count.toLocaleString()} Gaussians`,
    );
  }

  private createRenderer(context: GraphicsContext): void {
    this.spark = new SparkRenderer({
      renderer: context.renderer,
      onDirty: context.invalidate,
      enableLod: false,
      sortRadial: false,
      minSortIntervalMs: 32,
    });
    context.scene.add(this.spark);
  }

  update(frame: Readonly<TimelineFrame>): void {
    this.frame = frame;
    if (!this.mesh) return;
    if (!this.masks) return;
    const motion = this.reducedMotion.matches ? 0 : 1;
    if (this.masks.upper.value !== frame.upperEnvironment ||
        this.masks.circle.value !== frame.circleRadius ||
        this.masks.cylinder.value !== frame.cylinderLength ||
        this.masks.motion.value !== motion) {
      this.masks.upper.value = frame.upperEnvironment;
      this.masks.circle.value = frame.circleRadius;
      this.masks.cylinder.value = frame.cylinderLength;
      this.masks.motion.value = motion;
      this.mesh.needsUpdate = true;
    }
    this.root.visible = frame.upperEnvironment > 0 || frame.circleRadius > 0 || frame.cylinderLength > 0;
    if (this.canvas) {
      this.canvas.dataset.upperEnvironment = String(frame.upperEnvironment);
      this.canvas.dataset.circleRadius = String(frame.circleRadius);
      this.canvas.dataset.cylinderLength = String(frame.cylinderLength);
    }
  }
  resize(_viewport: Readonly<Viewport>): void {}
  contextLost(): void {
    // Release old-context objects while that context is still lost. Disposing
    // them after restoration attempts to delete handles from the old context.
    this.spark?.removeFromParent();
    this.spark?.dispose();
    this.spark = undefined;
  }
  contextRestored(context: GraphicsContext): void {
    if (!this.mesh) return;
    this.createRenderer(context);
    if (this.mesh) this.mesh.needsUpdate = true;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeTheme?.();
    this.cancelLoad?.();
    this.root.removeFromParent();
    this.spark?.removeFromParent();
    this.spark?.dispose();
    if (this.mesh) this.mesh.dispose();
    else this.splats?.dispose();
    this.root.clear();
  }
}
