/** Reuse the same links on desktop and in the native modal mobile drawer. */
export function initializeNavigation(): () => void {
  const header = document.querySelector<HTMLElement>(".site-header")!;
  const actions = header.querySelector<HTMLElement>(".header-actions")!;
  const nav = document.querySelector<HTMLElement>("#main-navigation")!;
  const toggle = document.querySelector<HTMLButtonElement>("#mobile-menu-toggle")!;
  const dialog = document.querySelector<HTMLDialogElement>("#mobile-menu")!;
  const media = window.matchMedia("(max-width: 700px)");
  const events = new AbortController();
  const options = { signal: events.signal };
  let previousOverflow = "";

  nav.querySelectorAll<HTMLAnchorElement>(".social-link").forEach(link => {
    const label = document.createElement("span");
    label.className = "nav-social-label";
    label.textContent = link.getAttribute("aria-label");
    link.append(label);
  });

  const close = () => {
    if (!dialog.open) return;
    dialog.close();
    document.body.style.overflow = previousOverflow;
    toggle.setAttribute("aria-expanded", "false");
  };
  const layout = () => {
    close();
    if (media.matches) dialog.append(nav);
    else header.insertBefore(nav, actions);
  };
  toggle.addEventListener("click", () => {
    if (!media.matches) return;
    previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    toggle.setAttribute("aria-expanded", "true");
  }, options);
  dialog.querySelector("#mobile-menu-close")!.addEventListener("click", close, options);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); }, options);
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll<HTMLElement>("button, a[href]")];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }, options);
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  }, options);
  nav.addEventListener("click", event => {
    if ((event.target as Element).closest("a")) close();
  }, options);
  media.addEventListener("change", layout, options);
  layout();
  toggle.hidden = false;
  return () => {
    close();
    events.abort();
    header.insertBefore(nav, actions);
    nav.querySelectorAll(".nav-social-label").forEach(label => label.remove());
  };
}
