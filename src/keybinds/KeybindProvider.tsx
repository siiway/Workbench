/**
 * Global keybind dispatcher. Owns the user's binding map (fetched from BFF),
 * mounts a window-level keydown listener, and resolves keys → action handlers.
 *
 * Action handlers are NOT registered here directly — instead each consumer
 * (e.g. ConsoleProvider for `console.toggle`, AppShell for `nav.*`) calls
 * `useKeybindHandler(actionId, fn)` so the handler closes over its own props.
 *
 * Sequence bindings (e.g. "g o") are matched with a 700ms timeout between
 * keys, matching GitHub-style chord conventions.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type ActionId,
  ACTIONS,
  ACTION_BY_ID,
} from "./actions";
import {
  type Binding,
  isEditableTarget,
  matchesCombo,
  parseBinding,
} from "./parse";

const SEQUENCE_TIMEOUT_MS = 700;

type KeybindApi = {
  /** Binding spec per action. Defaults applied. */
  bindings: Record<string, string>;
  /** Persist a new binding for action. */
  setBinding: (id: ActionId, spec: string) => Promise<void>;
  /** Reset to default. */
  resetBinding: (id: ActionId) => Promise<void>;
  /** Internal: register a handler for an action. */
  _register: (id: ActionId, handler: () => void) => () => void;
};

const KeybindContext = createContext<KeybindApi | null>(null);

export function KeybindProvider({ children }: { children: ReactNode }) {
  const [bindings, setBindings] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const a of ACTIONS) init[a.id] = a.defaultBinding;
    return init;
  });

  const handlersRef = useRef<Map<ActionId, Set<() => void>>>(new Map());

  // Load user prefs once on mount.
  useEffect(() => {
    fetch("/api/user/keybinds")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { bindings?: Record<string, string> } | null) => {
        if (!d?.bindings) return;
        setBindings((cur) => {
          const next = { ...cur };
          for (const [k, v] of Object.entries(d.bindings ?? {})) {
            next[k] = v;
          }
          return next;
        });
      })
      .catch(() => {
        /* fall back to defaults */
      });
  }, []);

  // Compile bindings to parsed form, indexed by action.
  const parsed = useMemo(() => {
    const m = new Map<ActionId, Binding>();
    for (const a of ACTIONS) {
      const b = parseBinding(bindings[a.id] ?? a.defaultBinding);
      if (b) m.set(a.id, b);
    }
    return m;
  }, [bindings]);

  // Pending-sequence buffer for sequence bindings.
  const sequenceBufRef = useRef<string[]>([]);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fire = useCallback((id: ActionId) => {
    const handlers = handlersRef.current.get(id);
    if (!handlers || handlers.size === 0) return;
    // Run the most-recently-registered handler (top of the stack).
    const last = Array.from(handlers).pop();
    last?.();
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const editable = isEditableTarget(e.target);

      // Try combo bindings first (these fire even in inputs since they need
      // modifiers — pure typing doesn't trigger them).
      for (const [id, b] of parsed) {
        if (b.kind === "combo" && matchesCombo(b.combo, e)) {
          e.preventDefault();
          // Combo wins → discard any pending sequence.
          sequenceBufRef.current = [];
          if (sequenceTimerRef.current) {
            clearTimeout(sequenceTimerRef.current);
            sequenceTimerRef.current = null;
          }
          fire(id);
          return;
        }
      }

      // Sequence bindings only outside editable elements (so typing "g" in a
      // search box doesn't kick off a chord).
      if (editable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // sequences are plain keys
      if (e.key.length !== 1) return; // only single-character keys

      const k = e.key.toLowerCase();
      sequenceBufRef.current.push(k);
      if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);

      // See if any sequence binding fully matches the buffer.
      for (const [id, b] of parsed) {
        if (b.kind !== "sequence") continue;
        const buf = sequenceBufRef.current;
        if (
          buf.length === b.keys.length &&
          buf.every((kk, i) => kk === b.keys[i])
        ) {
          e.preventDefault();
          sequenceBufRef.current = [];
          if (sequenceTimerRef.current) {
            clearTimeout(sequenceTimerRef.current);
            sequenceTimerRef.current = null;
          }
          fire(id);
          return;
        }
      }

      // Check if buffer is a prefix of any sequence; if not, reset (so a wrong
      // first key doesn't poison the next legitimate sequence).
      const stillPrefix = Array.from(parsed.values()).some((b) => {
        if (b.kind !== "sequence") return false;
        if (sequenceBufRef.current.length > b.keys.length) return false;
        return sequenceBufRef.current.every((kk, i) => kk === b.keys[i]);
      });
      if (!stillPrefix) {
        sequenceBufRef.current = [];
        return;
      }
      sequenceTimerRef.current = setTimeout(() => {
        sequenceBufRef.current = [];
        sequenceTimerRef.current = null;
      }, SEQUENCE_TIMEOUT_MS);
    },
    [parsed, fire],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const setBinding = useCallback(
    async (id: ActionId, spec: string) => {
      const next = { ...bindings, [id]: spec };
      setBindings(next);
      const onlyOverrides: Record<string, string> = {};
      for (const a of ACTIONS) {
        if (next[a.id] && next[a.id] !== a.defaultBinding) {
          onlyOverrides[a.id] = next[a.id];
        }
      }
      try {
        await fetch("/api/user/keybinds", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bindings: onlyOverrides }),
        });
      } catch {
        /* keep local state; will retry on next change */
      }
    },
    [bindings],
  );

  const resetBinding = useCallback(
    async (id: ActionId) => {
      const def = ACTION_BY_ID[id].defaultBinding;
      await setBinding(id, def);
    },
    [setBinding],
  );

  const _register = useCallback((id: ActionId, handler: () => void) => {
    let set = handlersRef.current.get(id);
    if (!set) {
      set = new Set();
      handlersRef.current.set(id, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }, []);

  const api = useMemo<KeybindApi>(
    () => ({ bindings, setBinding, resetBinding, _register }),
    [bindings, setBinding, resetBinding, _register],
  );

  return (
    <KeybindContext.Provider value={api}>{children}</KeybindContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useKeybinds(): KeybindApi {
  const ctx = useContext(KeybindContext);
  if (!ctx) throw new Error("useKeybinds must be used within KeybindProvider");
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useKeybindHandler(id: ActionId, handler: () => void) {
  const { _register } = useKeybinds();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    return _register(id, () => ref.current());
  }, [id, _register]);
}
