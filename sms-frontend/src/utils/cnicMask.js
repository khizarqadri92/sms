/**
 * CNIC mask for the whole app (src/utils/cnicMask.js)
 *
 * Every CNIC (and B-Form) box is formatted while typing or pasting:  3520212345671 -> 35202-1234567-1
 * Installed ONCE (main.jsx): installCnicMask(). No page needs changing - a box is recognised by its
 * name / id / placeholder / aria-label / label text containing "CNIC" or "B-Form", or by data-mask="cnic".
 * Works with React controlled inputs: the formatted value is passed to the page's own onChange.
 * Opt out on a box with data-mask="none".
 */

export function formatCnic(value) {
  const d = String(value ?? "").replace(/\D/g, "").slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return d.slice(0, 5) + "-" + d.slice(5);
  return d.slice(0, 5) + "-" + d.slice(5, 12) + "-" + d.slice(12);
}

export const isValidCnic = value => /^\d{5}-\d{7}-\d$/.test(String(value ?? ""));

const WORDS = /cnic|b[\s_-]?form|nic\b/i;

// the label shown next to a box: <label>CNIC</label><input>, a form group, or label/box pairs in one grid
function nearbyLabel(el) {
  const prev = el.previousElementSibling;
  if (prev && !/^(INPUT|SELECT|TEXTAREA)$/.test(prev.tagName) && prev.textContent.length < 60) return prev.textContent;
  let node = el.parentElement;
  for (let i = 0; i < 3 && node; i++, node = node.parentElement) {
    if (node.querySelectorAll("input, select, textarea").length > 1) break;      // stop at a container shared with other boxes
    const lbl = node.querySelector("label, legend, .form-label, .label, [class*='label']");
    if (lbl && lbl !== el && lbl.textContent.length < 60) return lbl.textContent;
  }
  return "";
}

const cache = new WeakMap();
function isCnicBox(el) {
  if (!el || el.tagName !== "INPUT") return false;
  if (cache.has(el)) return cache.get(el);
  const type = (el.getAttribute("type") || "text").toLowerCase();
  let yes = false;
  const mask = el.getAttribute("data-mask");
  if (mask === "none" || !["text", "search", "tel", "number", ""].includes(type)) yes = false;
  else if (mask === "cnic") yes = true;
  else {
    const hints = [el.name, el.id, el.placeholder, el.getAttribute("aria-label")];
    const label = el.closest("label") || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
    if (label) hints.push(label.textContent);
    hints.push(nearbyLabel(el));
    yes = hints.some(h => h && WORDS.test(h));
  }
  if (yes && type === "number") el.setAttribute("type", "text");        // a number box can't hold the dashes
  cache.set(el, yes);
  return yes;
}

// set the value the way React notices it, then let the page's onChange run with the formatted value
const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;

function applyMask(el) {
  const old = el.value;
  const formatted = formatCnic(old);
  if (formatted === old) return;
  const caret = el.selectionStart ?? old.length;
  const digitsBefore = old.slice(0, caret).replace(/\D/g, "").length;      // keep the cursor after the same digit
  valueSetter.call(el, formatted);
  let pos = 0, seen = 0;
  while (pos < formatted.length && seen < digitsBefore) { if (/\d/.test(formatted[pos])) seen++; pos++; }
  if (formatted[pos] === "-" && seen === digitsBefore && digitsBefore > 0 && old[caret - 1] !== "-") pos++;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  try { el.setSelectionRange(pos, pos); } catch { /* not focusable */ }
}

let installed = false;
export function installCnicMask() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.documentElement.setAttribute("data-cnic-mask", "on");         // check in the browser: the mask is loaded
  // capture phase: runs before React's own listener, so the page only ever sees the formatted value
  document.addEventListener("input", e => { if (isCnicBox(e.target)) applyMask(e.target); }, true);
  document.addEventListener("focusin", e => {
    const el = e.target;
    if (!isCnicBox(el)) return;
    if (!el.getAttribute("inputmode")) el.setAttribute("inputmode", "numeric");
    if (!el.getAttribute("maxlength")) el.setAttribute("maxlength", "15");
    if (!el.getAttribute("placeholder")) el.setAttribute("placeholder", "12345-1234567-1");
    if (el.value && formatCnic(el.value) !== el.value) applyMask(el);       // old unformatted values tidy up on focus
  }, true);
}

export default installCnicMask;
