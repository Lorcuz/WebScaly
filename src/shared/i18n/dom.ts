import { getLocale, initializeLocale, subscribeLocale, translateMessage } from "./index";

// Only call on extension-owned, non-React markup. Keep source strings so changing
// language never rebuilds a player or loses focus, slider state or event handlers.
const sources = new WeakMap<Node, { source: string; translated: string }>();
const attributes = new WeakMap<Element, Map<string, { source: string; translated: string }>>();
export function localize(root: HTMLElement | ShadowRoot) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest("script, style, [data-user-text]")) continue;
    const value = node.nodeValue ?? "";
    const previous = sources.get(node);
    const source = previous?.translated === value ? previous.source : value;
    const trimmed = source.trim();
    const translated = trimmed ? source.replace(trimmed, () => translateMessage(trimmed)) : source;
    sources.set(node, { source, translated });
    if (value !== translated) node.nodeValue = translated;
  }
  const elements = [...root.querySelectorAll<HTMLElement>("[title], [aria-label], [data-help]")];
  if (root instanceof HTMLElement) elements.push(root);
  for (const element of elements) {
    const cache = attributes.get(element) ?? new Map();
    attributes.set(element, cache);
    for (const name of ["title", "aria-label", "data-help"]) {
      const value = element.getAttribute(name);
      if (value === null) continue;
      const previous = cache.get(name);
      const source = previous?.translated === value ? previous.source : value;
      const translated = translateMessage(source);
      cache.set(name, { source, translated });
      if (value !== translated) element.setAttribute(name, translated);
    }
  }
  if (root instanceof HTMLElement) root.lang = getLocale();
  else if (root.host instanceof HTMLElement) root.host.lang = getLocale();
}
export function bindLocale(root: HTMLElement | ShadowRoot) {
  const refresh = () => localize(root);
  const unsubscribe = subscribeLocale(refresh);
  refresh();
  void initializeLocale().then(refresh);
  return unsubscribe;
}
