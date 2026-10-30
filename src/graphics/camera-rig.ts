import { PerspectiveCamera, Vector3 } from "three";
import type { CameraPose } from "./scene-layer";
import type { TimelineFrame } from "./timeline";
import type { Viewport } from "./scene-layer";

/** A controlled orbit; page scrolling never gets intercepted by pointer controls. */
export class CameraRig {
  readonly camera = new PerspectiveCamera(36, 1, 0.1, 50);
  private mobile = false;
  private pose?: CameraPose;
  private readonly orbitOffset = new Vector3();
  private readonly target = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  configure(pose: CameraPose): void {
    this.pose = pose;
    this.camera.fov = pose.fov;
    this.camera.near = 0.001;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
  }

  resize({ width, height }: Viewport): void {
    this.mobile = width <= 700;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Composition offset leaves readable space for the HTML hero.
    this.camera.setViewOffset(
      width,
      height,
      -width * (this.mobile ? 0.18 : 0.26),
      // Positive change in view offset lifts the scene within the viewport.
      height * (this.mobile ? -0.14 : 0),
      width,
      height,
    );
  }

  update(
    frame: Readonly<TimelineFrame>,
    idleSeconds: number,
    reducedMotion: boolean,
  ): void {
    // Idle movement is deliberately separate from the reversible scroll timeline.
    const angle = reducedMotion
      ? 0
      : frame.cameraOrbit + Math.sin(idleSeconds * 0.12) * 0.16;
    const distance = this.mobile ? 26 : 11.8;
    if (this.pose) {
      this.target.fromArray(this.pose.target);
      this.orbitOffset.fromArray(this.pose.position).sub(this.target);
      this.orbitOffset.applyAxisAngle(this.up, angle * 0.35);
      if (this.mobile) this.orbitOffset.multiplyScalar(1.7);
      this.camera.position.copy(this.target).add(this.orbitOffset);
      this.camera.lookAt(this.target);
      return;
    }
    this.camera.position.set(
      Math.sin(angle) * distance,
      1.5,
      Math.cos(angle) * distance,
    );
    this.camera.lookAt(0, 0.15, 0);
  }
}
