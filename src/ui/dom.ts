/** Tiny hyperscript helper: h("div.card.red", { onClick }, children...) */
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  selector: K | `${K}.${string}` | string,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElement {
  const [tag, ...classes] = selector.split(".");
  const el = document.createElement(tag || "div");
  if (classes.length) el.className = classes.join(" ");

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "dataset" && typeof value === "object") {
      Object.assign(el.dataset, value);
    } else if (key === "style" && typeof value === "object") {
      Object.assign(el.style, value);
    } else if (key in el && key !== "list" && key !== "form") {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, ...children);
  return el;
}

export function append(el: HTMLElement, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Replace el's children in one go. */
export function setChildren(el: HTMLElement, ...children: Child[]): void {
  clear(el);
  append(el, ...children);
}
