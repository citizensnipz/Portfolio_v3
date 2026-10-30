import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Points,
  PointsMaterial,
  TorusKnotGeometry,
} from "three";
import type { GraphicsContext, SceneLayer, Viewport } from "./scene-layer";
import type { TimelineFrame } from "./timeline";
import { rgbToHex, subscribeTheme, tintColor } from "../theme";

function pointSet(
  positions: number[],
  color: string,
  size: number,
  opacity = 1,
): Points<BufferGeometry, PointsMaterial> {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color: new Color(color),
    size,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return new Points(geometry, material);
}

/** Original procedural point study. These are ordinary Three.js points, not splats. */
export class PlaceholderLayer implements SceneLayer {
  private readonly root = new Group();
  private readonly environment = new Group();
  private readonly body = new Group();
  private readonly head = new Group();
  private unsubscribeTheme?: () => void;

  initialize({ scene, invalidate }: GraphicsContext): void {
    const knot = new TorusKnotGeometry(1.18, 0.37, 300, 24, 2, 3);
    const points = pointSet(
      Array.from(knot.getAttribute("position").array),
      "#cfdbb7",
      0.018,
    );
    knot.dispose();
    points.scale.set(0.86, 1.13, 0.86);
    points.rotation.set(0.1, 0.3, -0.13);
    points.position.y = 0.6;
    this.head.add(points);

    const stem: number[] = [];
    for (let row = 0; row < 75; row++) {
      const t = row / 74;
      const radius =
        0.34 + 0.22 * Math.pow(1 - t, 3) + 0.09 * Math.sin(t * Math.PI * 3);
      for (let col = 0; col < 90; col++) {
        const angle = (col / 90) * Math.PI * 2 + t * 0.6;
        stem.push(
          Math.cos(angle) * radius,
          -1.65 + t * 1.65,
          Math.sin(angle) * radius,
        );
      }
    }
    this.body.add(pointSet(stem, "#aaba95", 0.015, 0.75));

    const ground: number[] = [];
    for (let ring = 0; ring < 20; ring++) {
      const radius = 0.6 + ring * 0.116;
      for (let i = 0; i < 180; i++) {
        const a = (i / 180) * Math.PI * 2;
        ground.push(Math.cos(a) * radius, -1.75, Math.sin(a) * radius);
      }
    }
    this.environment.add(pointSet(ground, "#91a678", 0.012, 0.5));
    const dust: number[] = [];
    // Deterministic placement without per-frame allocation or random flicker.
    for (let i = 0; i < 330; i++) {
      const a = i * 2.399963;
      const r = 2.2 + (Math.sin(i * 17.7) * 0.5 + 0.5) * 1.2;
      dust.push(Math.cos(a) * r, Math.sin(i * 9.3) * 2.5, Math.sin(a) * r);
    }
    this.environment.add(pointSet(dust, "#84956d", 0.014, 0.35));
    this.root.add(this.environment, this.body, this.head);
    scene.add(this.root);
    this.unsubscribeTheme = subscribeTheme(theme => {
      this.root.traverse(object => {
        if (!(object instanceof Points)) return;
        const material = object.material as PointsMaterial;
        material.userData.originalColor ??= `#${material.color.getHexString()}`;
        material.color.set(rgbToHex(tintColor(material.userData.originalColor, theme.color)));
      });
      invalidate();
    });
  }

  update(frame: Readonly<TimelineFrame>): void {
    this.setOpacity(this.environment, frame.environmentOpacity);
    this.setOpacity(this.body, frame.bodyOpacity);
    this.setOpacity(this.head, frame.headOpacity);
    this.body.scale.setScalar(frame.bodyScale);
    this.head.scale.setScalar(1 - frame.reveal * 0.08);
  }

  private setOpacity(group: Group, value: number): void {
    group.visible = value > 0;
    group.children.forEach((child) => {
      const points = child as Points<BufferGeometry, PointsMaterial>;
      points.material.userData.baseOpacity ??= points.material.opacity;
      points.material.opacity =
        (points.material.userData.baseOpacity as number) * value;
    });
  }

  resize(_viewport: Readonly<Viewport>): void {
    /* World-space geometry is resolution independent. */
  }
  contextLost(): void {
    /* Three.js owns the buffers used by this layer. */
  }
  contextRestored(_context: GraphicsContext): void {
    /* Three.js reuploads retained CPU-side geometry. */
  }

  dispose(): void {
    this.unsubscribeTheme?.();
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (object instanceof Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.root.clear();
  }
}
