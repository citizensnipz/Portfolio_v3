import { clamp01 } from "../graphics/timeline";

/** Passive native scrolling. Geometry reads happen on layout changes, not per frame. */
export class ScrollProgress {
  private start = 0;
  private end = 1;
  private readonly observer: ResizeObserver;

  constructor(
    private readonly onChange: (progress: number) => void,
  ) {
    this.observer = new ResizeObserver(this.measure);
    this.observer.observe(document.body);
    window.addEventListener("resize", this.measure);
    window.addEventListener("scroll", this.read, { passive: true });
    this.measure();
  }

  private measure = (): void => {
    this.start = 0;
    this.end = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    this.read();
  };

  private read = (): void => {
    this.onChange(
      clamp01((window.scrollY - this.start) / (this.end - this.start)),
    );
  };

  dispose(): void {
    this.observer.disconnect();
    window.removeEventListener("resize", this.measure);
    window.removeEventListener("scroll", this.read);
  }
}
