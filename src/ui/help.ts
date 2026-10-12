/** Delayed hover help with a small Chrome 121-compatible popover. */
export function attachHelp(root: HTMLElement | Document) {
  let tip: HTMLElement | undefined;
  let owner: HTMLElement | undefined;
  let hovered: HTMLElement | undefined;
  let focused: HTMLElement | undefined;
  let dismissed: HTMLElement | undefined;
  let usingPointer = false;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let lastX = 0,
    lastY = 0;
  const cancel = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
  };
  const hide = () => {
    if (owner) {
      const ids = (owner.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter((id) => id && id !== tip?.id);
      if (ids.length) owner.setAttribute("aria-describedby", ids.join(" "));
      else owner.removeAttribute("aria-describedby");
    }
    tip?.remove();
    tip = undefined;
    owner = undefined;
  };
  const targetFor = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return undefined;
    const element = target.closest<HTMLElement>("[data-help]");
    return element?.dataset.help && !element.matches(":disabled")
      ? element
      : undefined;
  };
  const show = (target: HTMLElement) => {
    clearTimeout(hideTimer);
    if (owner === target || dismissed === target || !target.isConnected) return;
    hide();
    owner = target;
    tip = document.createElement("div");
    tip.id = "webscaly-help";
    tip.role = "tooltip";
    tip.className = "help-tooltip";
    tip.textContent = target.dataset.help!;
    // Native top-layer placement is supported by Chrome 121; retain a fixed-position fallback.
    if ("showPopover" in tip) tip.setAttribute("popover", "manual");
    document.body.append(tip);
    if (tip.hasAttribute("popover")) tip.showPopover();
    target.setAttribute(
      "aria-describedby",
      [target.getAttribute("aria-describedby"), tip.id]
        .filter(Boolean)
        .join(" "),
    );
    const r = target.getBoundingClientRect(),
      t = tip.getBoundingClientRect();
    const obstacles = [
      ...document.querySelectorAll<HTMLElement>("button,input,select,a"),
    ].map((element) => element.getBoundingClientRect());
    const placements = [
      [r.left, r.bottom + 6],
      [r.left, r.top - t.height - 6],
      [r.right + 6, r.top],
      [r.left - t.width - 6, r.top],
    ]
      .map(([x, y]) => {
        x = Math.max(6, Math.min(innerWidth - t.width - 6, x));
        y = Math.max(6, Math.min(innerHeight - t.height - 6, y));
        const cost = obstacles.reduce(
          (total, b) =>
            total +
            Math.max(0, Math.min(x + t.width, b.right) - Math.max(x, b.left)) *
              Math.max(
                0,
                Math.min(y + t.height, b.bottom) - Math.max(y, b.top),
              ),
          0,
        );
        return { x, y, cost };
      })
      .sort((a, b) => a.cost - b.cost);
    tip.style.left = placements[0].x + "px";
    tip.style.top = placements[0].y + "px";
    tip.addEventListener("pointerenter", () => clearTimeout(hideTimer));
    tip.addEventListener("pointerleave", () => {
      if (focused !== owner || usingPointer) hide();
    });
  };
  const schedule = (target: HTMLElement) => {
    clearTimeout(showTimer);
    if (owner === target || dismissed === target) return;
    showTimer = setTimeout(() => {
      if (hovered === target) show(target);
    }, 700);
  };
  const over = (event: Event) => {
    const pointer = event as PointerEvent;
    if (pointer.pointerType === "touch") return;
    const target = targetFor(event.target);
    if (!target || hovered === target) return;
    if (owner && owner !== target && focused !== owner) hide();
    hovered = target;
    lastX = pointer.clientX;
    lastY = pointer.clientY;
    clearTimeout(hideTimer);
    schedule(target);
  };
  const move = (event: Event) => {
    const pointer = event as PointerEvent;
    if (!hovered || owner === hovered || pointer.pointerType === "touch")
      return;
    if (
      Math.abs(pointer.clientX - lastX) + Math.abs(pointer.clientY - lastY) <
      3
    )
      return;
    lastX = pointer.clientX;
    lastY = pointer.clientY;
    schedule(hovered);
  };
  const out = (event: Event) => {
    const target = targetFor(event.target),
      related = (event as PointerEvent).relatedTarget;
    if (!target || (related instanceof Node && target.contains(related)))
      return;
    if (hovered === target) hovered = undefined;
    if (dismissed === target && focused !== target) dismissed = undefined;
    clearTimeout(showTimer);
    if (focused !== owner || usingPointer) hideTimer = setTimeout(hide, 160);
  };
  const focus = (event: Event) => {
    focused = targetFor(event.target);
    if (focused && !usingPointer) {
      cancel();
      show(focused);
    }
  };
  const blur = () => {
    focused = undefined;
    dismissed = undefined;
    cancel();
    hide();
  };
  const down = () => {
    usingPointer = true;
    cancel();
    hide();
  };
  const key = (event: KeyboardEvent) => {
    usingPointer = false;
    if (event.key === "Escape") {
      dismissed = owner ?? hovered ?? focused;
      cancel();
      hide();
    }
  };
  const reposition = () => {
    cancel();
    hide();
  };
  root.addEventListener("pointerover", over);
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerout", out);
  root.addEventListener("pointerdown", down);
  root.addEventListener("focusin", focus);
  root.addEventListener("focusout", blur);
  document.addEventListener("keydown", key);
  document.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);
  window.addEventListener("blur", blur);
  return () => {
    cancel();
    hide();
    root.removeEventListener("pointerover", over);
    root.removeEventListener("pointermove", move);
    root.removeEventListener("pointerout", out);
    root.removeEventListener("pointerdown", down);
    root.removeEventListener("focusin", focus);
    root.removeEventListener("focusout", blur);
    document.removeEventListener("keydown", key);
    document.removeEventListener("scroll", reposition, true);
    window.removeEventListener("resize", reposition);
    window.removeEventListener("blur", blur);
  };
}
