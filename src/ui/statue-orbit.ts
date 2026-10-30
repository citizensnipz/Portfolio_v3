/** Desktop mouse/pen interaction; touch scrolling and document controls remain native. */
export class StatueOrbit {
  private readonly events = new AbortController();
  private pointer: number | null = null;
  private x = 0;
  private y = 0;
  private capture: HTMLElement | null = null;
  private readonly finish = () => {
    if (this.pointer === null) return;
    const pointer = this.pointer;
    this.pointer = null;
    if (this.capture?.hasPointerCapture(pointer)) this.capture.releasePointerCapture(pointer);
    this.capture = null;
    document.body.classList.remove("statue-orbit-dragging", "statue-orbit-hover");
    this.active(false);
  };

  constructor(
    private readonly hit: (x: number, y: number) => boolean,
    private readonly drag: (dx: number, dy: number) => void,
    private readonly active: (value: boolean) => void,
  ) {
    const options = { signal: this.events.signal };
    const available = (event: PointerEvent) => window.innerWidth > 700 && event.pointerType !== "touch"
      && !(event.target as Element).closest("a, button, input, select, textarea, summary, dialog, [contenteditable], .about-copy, .project-card, .site-header")
      && this.hit(event.clientX, event.clientY);
    document.addEventListener("pointermove", event => {
      if (this.pointer === event.pointerId) {
        this.drag(event.clientX - this.x, event.clientY - this.y);
        this.x = event.clientX; this.y = event.clientY;
      } else if (this.pointer === null) {
        document.body.classList.toggle("statue-orbit-hover", available(event));
      }
    }, options);
    document.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !event.isPrimary || !available(event)) return;
      event.preventDefault();
      this.pointer = event.pointerId;
      this.x = event.clientX; this.y = event.clientY;
      this.capture = document.body;
      this.capture.setPointerCapture(event.pointerId);
      document.body.classList.add("statue-orbit-dragging");
      this.active(true);
    }, options);
    document.addEventListener("pointerup", this.finish, options);
    document.addEventListener("pointercancel", this.finish, options);
    document.addEventListener("lostpointercapture", this.finish, options);
    window.addEventListener("blur", this.finish, options);
    window.addEventListener("resize", this.finish, options);
    window.addEventListener("scroll", this.finish, { ...options, passive: true });
    document.addEventListener("keydown", event => { if (event.key === "Escape") this.finish(); }, options);
  }

  dispose(): void {
    this.finish();
    this.events.abort();
    document.body.classList.remove("statue-orbit-hover", "statue-orbit-dragging");
  }
}
