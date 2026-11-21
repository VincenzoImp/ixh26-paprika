// Paprika web app: tiny DOM helpers shared by every module.
// h() builds elements declaratively (no framework); tid() finds elements by data-testid, the page's stable names.

// Creates an element. attrs: class, testid (-> data-testid), on<event> handlers, dataset via data-*, any attribute.
// Children may be strings, nodes, arrays, or null/false (skipped).
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "testid") el.dataset.testid = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else if (k === "disabled") el.disabled = !!v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  append(el, children);
  return el;
}

// Appends children (strings, nodes, nested arrays) to an element.
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === "") continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// The element with this data-testid (or null).
export function tid(id, root = document) {
  return root.querySelector(`[data-testid="${id}"]`);
}

// Replaces all children of an element.
export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}
