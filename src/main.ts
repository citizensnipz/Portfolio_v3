import "./style.css";
import "./responsive.css";
import "./ui/theme-picker.css";
import "./ui/navigation.css";
import { initializeNavigation } from "./ui/navigation";
import { initializeThemePicker } from "./ui/theme-picker";
import { ScrollProgress } from "./ui/scroll-progress";
import type { GraphicsEngine, GraphicsState } from "./graphics/engine";
import type { SceneLayer } from "./graphics/scene-layer";

const host = document.querySelector<HTMLElement>("#graphics")!;
const status = document.querySelector<HTMLElement>("#graphics-status")!;
const toggle = document.querySelector<HTMLButtonElement>("#motion-toggle")!;
const disposeThemePicker = initializeThemePicker();
const disposeNavigation = initializeNavigation();
let graphics: GraphicsEngine | undefined;
let scroll: ScrollProgress | undefined;
let paused = false;
let disposed = false;
let loadSeconds: number | undefined;
const params = new URLSearchParams(location.search);
const placeholderMode = params.get("scene") === "placeholder";
const sceneName = placeholderMode ? "point study" : "Gaussian statue";
const compactMode = params.get("quality") === "compact";
const gpcMode = params.get("scene") === "gpc" || compactMode;
const sceneFormat = placeholderMode ? "placeholder" : gpcMode ? "gpc" : "sog";
const manifestName = compactMode
  ? "radegast-compact"
  : gpcMode
    ? "radegast"
    : "radegast-sog";
host.dataset.scene = sceneFormat;
if (placeholderMode)
  document.querySelector(".scene-label div")!.innerHTML =
    "STUDY 001 — POINT FORM<span>Procedural geometry / WebGL2</span>";

document.querySelector("#year")!.textContent = String(new Date().getFullYear());

function updateStatus(state: GraphicsState, reducedMotion: boolean): void {
  if (state === "ready" && loadSeconds === undefined) {
    const mark = performance.mark("portfolio:scene-ready");
    loadSeconds = mark.startTime / 1000;
    performance.measure("portfolio:scene-load", {
      start: 0,
      end: "portfolio:scene-ready",
    });
    host.dataset.loadSeconds = loadSeconds.toFixed(2);
  }
  status.textContent =
    state === "lost"
      ? "Graphics paused · restoring context"
      : state === "fallback"
        ? "Static preview · graphics unavailable"
        : state === "loading"
          ? `Loading ${sceneName}`
          : reducedMotion
            ? "Reduced motion · scroll to explore"
            : `Live ${sceneName}`;
  if (state === "ready" && loadSeconds !== undefined)
    status.textContent += ` · ready in ${loadSeconds.toFixed(1)}s`;
  toggle.disabled = state !== "ready" || reducedMotion;
  toggle.innerHTML = reducedMotion
    ? "Reduced motion enabled"
    : paused
      ? 'Resume motion <span aria-hidden="true">▷</span>'
      : 'Pause motion <span aria-hidden="true">Ⅱ</span>';
  toggle.setAttribute("aria-pressed", String(paused));
}

function toggleMotion(): void {
  paused = !paused;
  graphics?.setPaused(paused);
  updateStatus("ready", false);
}
toggle.addEventListener("click", toggleMotion);

const sectionObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      document.querySelectorAll<HTMLAnchorElement>("nav a").forEach((link) => {
        // LinkedIn is intentionally a placeholder pointing to contact, not a section tab.
        if (
          link.hash === `#${entry.target.id}` &&
          !link.classList.contains("nav-external")
        )
          link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }
  },
  { rootMargin: "-20% 0px -79% 0px" },
);
document
  .querySelectorAll("main > section")
  .forEach((section) => sectionObserver.observe(section));

async function startGraphics(): Promise<void> {
  try {
    // The document remains immediately usable while the optional graphics chunk loads.
    const { GraphicsEngine } = await import("./graphics/engine");
    let layer: SceneLayer;
    if (placeholderMode) {
      const { PlaceholderLayer } = await import("./graphics/placeholder");
      layer = new PlaceholderLayer();
    } else {
      const { GpcSceneLayer } = await import("./graphics/gpc/layer");
      layer = new GpcSceneLayer(
        new URL(
          `${import.meta.env.BASE_URL}scenes/${manifestName}.json`,
          location.href,
        ).href,
        (message) => {
          status.textContent = message;
        },
      );
    }
    if (disposed) return;
    graphics = new GraphicsEngine(host, layer, updateStatus);
    scroll = new ScrollProgress(
      (progress) => graphics?.setProgress(progress),
    );
    await graphics.initialize();
  } catch (error) {
    console.warn("Could not load the optional graphics background.", error);
    host.dataset.state = "fallback";
    updateStatus("fallback", false);
  }
}
void startGraphics();

function dispose(): void {
  disposed = true;
  disposeThemePicker();
  disposeNavigation();
  scroll?.dispose();
  graphics?.dispose();
  sectionObserver.disconnect();
  toggle.removeEventListener("click", toggleMotion);
}

// Preserve resources for the browser back/forward cache; visibilitychange suspends RAF.
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) dispose();
});
if (import.meta.hot) import.meta.hot.dispose(dispose);
