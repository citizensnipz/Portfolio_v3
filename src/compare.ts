import "./comparison.css";
import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GpcSceneLayer } from "./graphics/gpc/layer";
import { sampleTimeline } from "./graphics/timeline";
import type { CameraPose, Viewport } from "./graphics/scene-layer";

const host = document.querySelector<HTMLElement>("#viewer")!;
const status = [
  document.querySelector<HTMLElement>("#left-status")!,
  document.querySelector<HTMLElement>("#right-status")!,
];
const baseline = document.querySelector<HTMLSelectElement>("#baseline")!;
const candidate = document.querySelector<HTMLSelectElement>("#candidate")!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let renderer: WebGLRenderer | undefined;
let controls: OrbitControls | undefined;
const camera = new PerspectiveCamera(80, 1, 0.001, 100);
const scenes = [new Scene(), new Scene()];
const layers: (GpcSceneLayer | undefined)[] = [];
const readyLabels: string[] = [];
const aborts: AbortController[] = [];
let home: CameraPose | undefined;
let frame = 0,
  disposed = false,
  lost = false,
  orbit = false,
  last = 0;
let viewport: Viewport = { width: 1, height: 1, pixelRatio: 1 };

function invalidate() {
  if (!frame && !disposed && !lost && !document.hidden)
    frame = requestAnimationFrame(render);
}
function render(time: number) {
  frame = 0;
  if (!renderer || disposed || lost || document.hidden) return;
  if (orbit && !reduced.matches) {
    const dt = last ? Math.min((time - last) / 1000, 0.05) : 0;
    const offset = camera.position
      .clone()
      .sub(controls!.target)
      .applyAxisAngle(new Vector3(0, 1, 0), dt * 0.08);
    camera.position.copy(controls!.target).add(offset);
    camera.lookAt(controls!.target);
    last = time;
  } else last = 0;
  const half = Math.floor(viewport.width / 2);
  renderer.setScissorTest(true);
  for (let i = 0; i < 2; i++) {
    const width = i === 0 ? half : viewport.width - half;
    camera.aspect = width / viewport.height;
    camera.updateProjectionMatrix();
    renderer.setViewport(i === 0 ? 0 : half, 0, width, viewport.height);
    renderer.setScissor(i === 0 ? 0 : half, 0, width, viewport.height);
    renderer.render(scenes[i], camera);
  }
  renderer.setScissorTest(false);
  if (orbit && !reduced.matches) invalidate();
}
function resize() {
  if (!renderer) return;
  viewport = {
    width: host.clientWidth,
    height: host.clientHeight,
    pixelRatio: Math.min(devicePixelRatio || 1, 1.5),
  };
  renderer.setPixelRatio(viewport.pixelRatio);
  renderer.setSize(viewport.width, viewport.height, false);
  layers.forEach((layer) => layer?.resize(viewport));
  invalidate();
}
function configure(pose: CameraPose) {
  if (home) return;
  home = pose;
  camera.position.fromArray(pose.position);
  camera.fov = pose.fov;
  controls!.target.fromArray(pose.target);
  camera.lookAt(controls!.target);
  camera.updateProjectionMatrix();
  controls!.update();
}
function context(i: number) {
  return {
    renderer: renderer!,
    scene: scenes[i],
    camera,
    signal: aborts[i].signal,
    invalidate,
    configureCamera: configure,
  };
}
async function load(i: number, name: string) {
  aborts[i]?.abort();
  layers[i]?.dispose();
  aborts[i] = new AbortController();
  const manifestUrl = new URL(
    `${import.meta.env.BASE_URL}scenes/${name}.json`,
    location.href,
  ).href;
  status[i].textContent = "Loading…";
  const layer = new GpcSceneLayer(manifestUrl, () => {}, (text) => {
    status[i].textContent = text;
  });
  layers[i] = layer;
  try {
    await layer.initialize(context(i));
    if (disposed || layers[i] !== layer) return;
    layer.update(sampleTimeline(0));
    layer.resize(viewport);
    const manifest = await (
      await fetch(manifestUrl, { signal: aborts[i].signal })
    ).json();
    status[i].textContent =
      `${(manifest.bytes / 1e6).toFixed(2)} MB · ${manifest.count.toLocaleString()} Gaussians`;
    readyLabels[i] = status[i].textContent;
    invalidate();
  } catch (error) {
    if (layers[i] === layer && !aborts[i].signal.aborted) {
      status[i].textContent =
        `Could not load: ${error instanceof Error ? error.message : String(error)}`;
      layer.dispose();
    }
  }
}
function reset(detail = false) {
  if (!home) return;
  camera.position.fromArray(home.position);
  controls!.target.fromArray(home.target);
  if (detail) {
    camera.position
      .sub(controls!.target)
      .multiplyScalar(0.5)
      .add(controls!.target);
  }
  camera.lookAt(controls!.target);
  controls!.update();
  invalidate();
}
const observer = new ResizeObserver(resize);
async function start() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    powerPreference: "low-power",
  });
  if (!gl) {
    status.forEach((s) => (s.textContent = "WebGL2 is unavailable"));
    return;
  }
  renderer = new WebGLRenderer({ canvas, context: gl, antialias: false });
  renderer.setClearColor(0x111411, 1);
  host.append(canvas);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.addEventListener("change", invalidate);
  controls.minDistance = 0.03;
  controls.maxDistance = 20;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    layers.forEach((layer) => layer?.contextLost());
    status.forEach(
      (s) => (s.textContent = "Graphics context lost · waiting to restore"),
    );
  });
  canvas.addEventListener("webglcontextrestored", () => {
    lost = false;
    layers.forEach((layer, i) => layer?.contextRestored(context(i)));
    status.forEach(
      (s, i) => (s.textContent = readyLabels[i] || "Context restored"),
    );
    resize();
  });
  observer.observe(host);
  resize();
  baseline.disabled = true;
  candidate.disabled = true;
  await load(0, baseline.value);
  await load(1, candidate.value);
  baseline.disabled = false;
  candidate.disabled = false;
}
baseline.addEventListener("change", () => {
  document.querySelector("#left-title")!.textContent =
    baseline.selectedOptions[0].textContent!.split(" · ")[0];
  void load(0, baseline.value);
});
candidate.addEventListener("change", () => {
  document.querySelector("#right-title")!.textContent =
    candidate.value === "radegast-sog"
      ? "SOG"
      : "Shared SH palette + packed rotation";
  void load(1, candidate.value);
});
document.querySelector("#reset")!.addEventListener("click", () => reset());
document.querySelector("#detail")!.addEventListener("click", () => reset(true));
const orbitButton = document.querySelector<HTMLButtonElement>("#orbit")!;
orbitButton.addEventListener("click", () => {
  orbit = !orbit;
  last = 0;
  orbitButton.textContent = orbit ? "Pause orbit" : "Start orbit";
  orbitButton.setAttribute("aria-pressed", String(orbit));
  invalidate();
});
function motion() {
  orbitButton.disabled = reduced.matches;
  if (reduced.matches) {
    orbit = false;
    orbitButton.textContent = "Start orbit";
    orbitButton.setAttribute("aria-pressed", "false");
  }
  invalidate();
}
reduced.addEventListener("change", motion);
motion();
function visibility() {
  last = 0;
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
  } else invalidate();
}
document.addEventListener("visibilitychange", visibility);
function dispose() {
  disposed = true;
  cancelAnimationFrame(frame);
  aborts.forEach((a) => a.abort());
  layers.forEach((l) => l?.dispose());
  controls?.dispose();
  observer.disconnect();
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer?.domElement.remove();
  document.removeEventListener("visibilitychange", visibility);
  reduced.removeEventListener("change", motion);
}
void start().catch((e) => {
  status.forEach((s) => (s.textContent = String(e)));
  dispose();
});
window.addEventListener("pagehide", (e) => {
  if (!e.persisted) dispose();
});
if (import.meta.hot) import.meta.hot.dispose(dispose);
