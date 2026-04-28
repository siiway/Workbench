/**
 * Keybind spec parser + matcher.
 *
 * Two binding shapes:
 *   - Combo:    "Ctrl+`", "Cmd+K", "Ctrl+Shift+P"  — single chord with modifiers
 *   - Sequence: "g o", "g t"                        — successive plain keys
 *
 * Heuristic: if the spec contains "+", it's a combo; otherwise (any spaces) it
 * is a sequence. Whitespace is normalised. Modifier names are case-insensitive.
 */

export type Combo = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  /** Single character key, lowercased for letters. */
  key: string;
};

export type Binding =
  | { kind: "combo"; combo: Combo; raw: string }
  | { kind: "sequence"; keys: string[]; raw: string };

export function parseBinding(raw: string): Binding | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes("+")) {
    const parts = trimmed.split("+").map((p) => p.trim()).filter(Boolean);
    const combo: Combo = {
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
      key: "",
    };
    for (const p of parts) {
      const lower = p.toLowerCase();
      if (lower === "ctrl" || lower === "control") combo.ctrl = true;
      else if (lower === "shift") combo.shift = true;
      else if (lower === "alt" || lower === "option") combo.alt = true;
      else if (lower === "meta" || lower === "cmd" || lower === "command")
        combo.meta = true;
      else combo.key = lower.length === 1 ? lower : lower;
    }
    if (!combo.key) return null;
    return { kind: "combo", combo, raw: trimmed };
  }

  // Sequence: split by whitespace.
  const keys = trimmed.split(/\s+/).map((k) => k.toLowerCase());
  if (keys.length === 0) return null;
  return { kind: "sequence", keys, raw: trimmed };
}

export function matchesCombo(combo: Combo, e: KeyboardEvent): boolean {
  if (combo.ctrl !== e.ctrlKey) return false;
  if (combo.shift !== e.shiftKey) return false;
  if (combo.alt !== e.altKey) return false;
  if (combo.meta !== e.metaKey) return false;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  return k === combo.key;
}

/** True if the event target is an editable element where typing keys should
 *  pass through (skip sequence shortcuts). Combo shortcuts still fire. */
export function isEditableTarget(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}

/** Render a binding back to a human-readable string. */
export function formatBinding(b: Binding): string {
  if (b.kind === "combo") {
    const mods: string[] = [];
    if (b.combo.ctrl) mods.push("Ctrl");
    if (b.combo.meta) mods.push("Cmd");
    if (b.combo.alt) mods.push("Alt");
    if (b.combo.shift) mods.push("Shift");
    return [...mods, b.combo.key.toUpperCase()].join("+");
  }
  return b.keys.join(" ");
}

/**
 * Capture a key combo from a keydown event into a string spec.
 * Used by the "press a key" recorder UI in Settings.
 */
export function comboFromEvent(e: KeyboardEvent): string | null {
  // Ignore pure modifier presses.
  if (
    e.key === "Control" ||
    e.key === "Shift" ||
    e.key === "Alt" ||
    e.key === "Meta"
  ) {
    return null;
  }
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.metaKey) parts.push("Cmd");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(key);
  return parts.length > 1 ? parts.join("+") : key;
}
