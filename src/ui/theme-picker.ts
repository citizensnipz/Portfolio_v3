import { DEFAULT_THEME, THEME_STORAGE_KEY, hexToRgb, hsvToRgb, normalizeHex, rgbToHex, rgbToHsv, setTheme, subscribeTheme, type RGB } from "../theme";

export function initializeThemePicker(): () => void {
  const root = document.documentElement;
  const button = document.querySelector<HTMLButtonElement>("#theme-toggle")!;
  const panel = document.querySelector<HTMLElement>("#theme-panel")!;
  const wheel = panel.querySelector<HTMLElement>(".theme-wheel")!;
  const thumb = panel.querySelector<HTMLElement>(".theme-wheel-thumb")!;
  const hex = panel.querySelector<HTMLInputElement>("#theme-hex")!;
  const sliders = ["hue", "saturation", "brightness"].map(id => panel.querySelector<HTMLInputElement>(`#theme-${id}`)!);
  const channels = ["r", "g", "b"].map(id => panel.querySelector<HTMLInputElement>(`#theme-${id}`)!);
  const events = new AbortController();
  const options = { signal: events.signal };
  let color = DEFAULT_THEME;
  let hsv = rgbToHsv(hexToRgb(color));
  let dragging = false;

  const renderControls = () => {
    const rgb = hexToRgb(color);
    hex.value = color.toUpperCase();
    hex.setCustomValidity("");
    channels.forEach((input, i) => { input.value = String(rgb[i]); });
    sliders.forEach((input, i) => { input.value = String(i ? hsv[i] * 100 : hsv[i]); });
    const angle = hsv[0] * Math.PI / 180;
    thumb.style.left = `${50 + Math.cos(angle) * hsv[1] * 50}%`;
    thumb.style.top = `${50 + Math.sin(angle) * hsv[1] * 50}%`;
    wheel.style.setProperty("--wheel-value", String(1 - hsv[2]));
  };
  const unsubscribe = subscribeTheme(theme => {
    color = theme.color;
    root.style.setProperty("--theme-seed", color);
    for (const [name, rgb] of Object.entries(theme.tones)) root.style.setProperty(`--${name}-rgb`, rgb.join(" "));
    root.style.setProperty("--theme-rotation", `${theme.rotation}deg`);
    root.style.setProperty("--theme-saturation", String(theme.saturation));
  });
  const commit = (next: string, fromWheel = false, save = true) => {
    const normalized = normalizeHex(next);
    if (!normalized) return;
    setTheme(normalized);
    if (!fromWheel) hsv = rgbToHsv(hexToRgb(normalized));
    renderControls();
    if (save) try { localStorage.setItem(THEME_STORAGE_KEY, normalized); } catch { /* Session-only theme still works. */ }
  };
  // Subscribe first, then restore the saved choice without a storage write.
  let saved = DEFAULT_THEME;
  try { saved = normalizeHex(localStorage.getItem(THEME_STORAGE_KEY) ?? "") ?? DEFAULT_THEME; } catch { /* Optional storage. */ }
  commit(saved, false, false);

  const close = (returnFocus = false) => {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (returnFocus) button.focus({ preventScroll: true });
  };
  button.addEventListener("click", () => {
    if (!panel.hidden) { close(); return; }
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    sliders[0].focus({ preventScroll: true });
  }, options);
  panel.querySelector("#theme-close")!.addEventListener("click", () => close(true), options);
  panel.addEventListener("focusout", event => {
    const next = event.relatedTarget as Node | null;
    if (next && !panel.contains(next) && !button.contains(next)) close();
  }, options);
  document.addEventListener("pointerdown", event => {
    if (!panel.hidden && !panel.contains(event.target as Node) && !button.contains(event.target as Node)) close();
  }, options);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) { event.preventDefault(); close(true); }
  }, options);

  const pick = (event: PointerEvent) => {
    const rect = wheel.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    hsv[0] = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    hsv[1] = Math.min(1, Math.hypot(x, y));
    commit(rgbToHex(hsvToRgb(hsv)), true);
  };
  wheel.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    dragging = true;
    wheel.setPointerCapture(event.pointerId);
    pick(event);
  }, options);
  wheel.addEventListener("pointermove", event => { if (dragging) pick(event); }, options);
  wheel.addEventListener("pointerup", () => { dragging = false; }, options);
  wheel.addEventListener("lostpointercapture", () => { dragging = false; }, options);
  sliders.forEach((input, i) => input.addEventListener("input", () => {
    hsv[i] = input.valueAsNumber / (i ? 100 : 1);
    commit(rgbToHex(hsvToRgb(hsv)), true);
  }, options));
  channels.forEach(input => {
    input.addEventListener("input", () => {
      if (channels.every(c => c.value !== "" && c.validity.valid)) commit(rgbToHex(channels.map(c => c.valueAsNumber) as RGB));
    }, options);
    input.addEventListener("blur", renderControls, options);
  });
  hex.addEventListener("input", () => hex.setCustomValidity(""), options);
  hex.addEventListener("change", () => {
    if (normalizeHex(hex.value)) commit(hex.value);
    else { hex.setCustomValidity("Enter a hex color, such as #FF9B58."); hex.reportValidity(); }
  }, options);
  panel.querySelector("#theme-reset")!.addEventListener("click", () => {
    commit(DEFAULT_THEME, false, false);
    try { localStorage.removeItem(THEME_STORAGE_KEY); } catch { /* Optional storage. */ }
  }, options);
  button.hidden = false;
  return () => { events.abort(); unsubscribe(); };
}
