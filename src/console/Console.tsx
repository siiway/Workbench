/**
 * The console UI itself — input box with inline ghost-text hints, suggestion
 * list, and scrollback. Stateless w.r.t. the page chrome; both ConsolePage
 * and ConsoleDrawer wrap it.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  makeStyles,
  mergeClasses,
  tokens,
  Button,
} from "@fluentui/react-components";
import { ChevronRightRegular, DismissRegular } from "@fluentui/react-icons";
import { useConsole } from "./ConsoleProvider";
import {
  detectSigil,
  ghostTextFor,
  parseInput,
  suggestionsFor,
  type Sigil,
} from "./dispatch";
import type { OutputBlock, SuggestionItem } from "./types";
import type { AppCard } from "../types";
import {
  getCachedApps,
  refreshAll,
  refreshApps,
  subscribe as subscribeCache,
} from "./dataCache";
import { fuzzySort } from "./fuzzy";

type Props = {
  teamId: string;
  /** When true, an "X" close button is rendered in the header (drawer mode). */
  showClose?: boolean;
  onClose?: () => void;
  /**
   * Visibility signal from the host. The dedicated page passes `true` once mounted;
   * the drawer flips it with `drawerOpen`. We focus the input every time this
   * transitions to true so the user doesn't have to click into it.
   */
  visible?: boolean;
};

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontFamily:
      "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
    fontSize: "13px",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "6px 12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: "12px",
    color: tokens.colorNeutralForeground3,
    gap: "8px",
    flexShrink: 0,
  },
  spacer: { flex: 1 },
  scroll: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minHeight: 0,
  },
  blockCommand: {
    display: "flex",
    gap: "8px",
    alignItems: "baseline",
    color: tokens.colorNeutralForeground2,
  },
  prompt: {
    color: tokens.colorBrandForeground1,
  },
  blockText: {
    whiteSpace: "pre-wrap",
  },
  blockMuted: { color: tokens.colorNeutralForeground3 },
  blockError: { color: tokens.colorPaletteRedForeground1 },
  blockSuccess: { color: tokens.colorPaletteGreenForeground1 },
  table: {
    borderCollapse: "collapse",
    margin: "4px 0",
  },
  th: {
    textAlign: "left",
    padding: "2px 12px 2px 0",
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    fontSize: "11.5px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  td: {
    padding: "2px 12px 2px 0",
    verticalAlign: "top",
  },
  inputArea: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "8px 14px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  inputRow: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  inputPrompt: {
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
  },
  inputWrap: {
    position: "relative",
    flex: 1,
    minWidth: 0,
  },
  inputOverlay: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    display: "flex",
    alignItems: "center",
    fontFamily: "inherit",
    fontSize: "inherit",
    color: tokens.colorNeutralForeground1,
    whiteSpace: "pre",
    overflow: "hidden",
  },
  inputOverlayHidden: {
    visibility: "hidden",
  },
  inputGhost: {
    fontStyle: "italic",
    color: tokens.colorNeutralForeground4,
  },
  input: {
    flex: 1,
    width: "100%",
    border: "none",
    outline: "none",
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground1,
    caretColor: tokens.colorNeutralForeground1,
    fontFamily: "inherit",
    fontSize: "inherit",
    padding: 0,
    "&::placeholder": { color: tokens.colorNeutralForeground4 },
  },
  // OpenCode-style centered overlay. Fixed-position so it floats above the
  // page chrome and centers on screen regardless of whether the console is
  // mounted in the drawer or on its dedicated page.
  suggestionsOverlay: {
    position: "fixed",
    left: "50%",
    bottom: "min(40vh, 360px)",
    transform: "translateX(-50%)",
    width: "min(640px, 92vw)",
    maxHeight: "min(50vh, 420px)",
    overflowY: "auto",
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow28,
    zIndex: 1000,
    padding: "4px",
    fontFamily:
      "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
    fontSize: "13px",
  },
  suggestionItem: {
    padding: "8px 12px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    borderRadius: tokens.borderRadiusMedium,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground3,
    },
  },
  suggestionItemActive: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
  },
  suggestionsFooter: {
    padding: "6px 12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3,
    fontSize: "11px",
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    marginTop: "4px",
  },
  kbd: {
    fontFamily: "inherit",
    padding: "1px 5px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "3px",
    backgroundColor: tokens.colorNeutralBackground2,
    fontSize: "10.5px",
  },
  suggestionLabel: {
    fontFamily: "inherit",
    flex: 1,
  },
  suggestionHint: {
    color: tokens.colorNeutralForeground3,
    fontSize: "11.5px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "260px",
  },
  suggestionCategory: {
    color: tokens.colorNeutralForeground4,
    fontSize: "10.5px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "1px 6px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "4px",
  },
});

export function Console({ teamId, showClose, onClose, visible = true }: Props) {
  const styles = useStyles();
  const { blocks, input, history, setInput, run, registry } = useConsole();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [busy, setBusy] = useState(false);

  // Auto-focus when the console becomes visible. Re-focus on every visible→true
  // transition so the drawer behaves like a Spotlight-style overlay.
  useEffect(() => {
    if (!visible) return;
    // Wait one frame so any open/close transform animation has started — the
    // browser otherwise refuses to focus an element it considers hidden.
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [visible]);

  // Bump on cache update so memoised suggestions recompute synchronously.
  const [cacheVersion, setCacheVersion] = useState(0);
  useEffect(() => {
    return subscribeCache(() => setCacheVersion((v) => v + 1));
  }, []);

  // Kick off background refresh when team changes (data is then cached).
  useEffect(() => {
    if (teamId) void refreshAll(teamId);
  }, [teamId]);

  // Sigil + parsed state derived from current input.
  const sigil = useMemo(() => detectSigil(input), [input]);
  // Command mode is gated to the `/` sigil. Other sigils (and no prefix)
  // never run command parsing.
  const parsedCommand = useMemo(() => {
    if (sigil?.sigil !== "/") return null;
    return parseInput(sigil.query, registry);
  }, [sigil, registry]);
  const ghost = parsedCommand && sigil
    ? ghostTextFor(parsedCommand, sigil.query)
    : "";

  // Auto-scroll on new output.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [blocks]);

  // Recompute suggestions synchronously on every input/cache change.
  const computedSuggestions = useMemo<SuggestionItem[]>(() => {
    void cacheVersion; // dependency only; cache is read synchronously below.
    if (!input.trim()) return [];
    if (sigil) {
      if (sigil.sigil === "/") {
        // Command palette mode.
        if (!parsedCommand) return [];
        const ctx = {
          teamId,
          print: () => {},
          println: () => {},
          setInput,
          navigate: () => {},
        };
        return suggestionsFor(parsedCommand, ctx, registry);
      }
      if (getCachedApps(teamId).length === 0) void refreshApps(teamId);
      return suggestForSigil(sigil.sigil, sigil.query, teamId);
    }
    // No prefix → fuzzy-match apps as a launcher.
    const apps = getCachedApps(teamId);
    if (apps.length === 0) {
      void refreshApps(teamId);
      return [];
    }
    return fuzzySort(apps, input.trim(), (a) => a.name)
      .slice(0, 12)
      .map(({ item }) => ({
        id: item.id,
        label: item.name,
        hint: item.url,
        category: "app",
        runImmediately: () => {
          window.open(item.url, "_blank", "noopener,noreferrer");
        },
      }));
  }, [input, sigil, parsedCommand, registry, teamId, setInput, cacheVersion]);

  useEffect(() => {
    setSuggestions(computedSuggestions);
  }, [computedSuggestions]);

  // Reset highlight only when the user's input changes — NOT when the cache
  // refreshes and the suggestions list silently re-computes. Otherwise the
  // arrow keys appear broken because every background fetch knocks the
  // selection back to position 0.
  useEffect(() => {
    setActiveSuggestion(0);
  }, [input]);

  // Clamp active index in case the suggestions list shrank under us.
  useEffect(() => {
    if (activeSuggestion >= suggestions.length && suggestions.length > 0) {
      setActiveSuggestion(suggestions.length - 1);
    }
  }, [suggestions.length, activeSuggestion]);

  // Per-item refs so we can scrollIntoView() when arrow keys move the
  // selection past the visible window of the suggestion list.
  const suggestionRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    suggestionRefs.current[activeSuggestion]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeSuggestion]);

  const onKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // A previous command is still running. Swallow Enter rather than
      // queuing — and keep focus on the input so the user can keep typing.
      if (busy) return;
      const trimmed = input.trim();
      if (!trimmed) return;
      const active = suggestions[activeSuggestion];

      // App-only sigils (#@:!) — suggestion's runImmediately IS the action.
      if (
        sigil &&
        sigil.sigil !== "/" &&
        sigil.sigil !== "?"
      ) {
        if (active?.runImmediately) {
          await active.runImmediately();
          setInput("");
        }
        return;
      }

      // / mode: take the suggestion first if the command isn't ready yet
      // (so Enter on /todos cla picks "todos claim" instead of failing).
      if (
        sigil?.sigil === "/" &&
        active &&
        parsedCommand &&
        !parsedCommand.ready &&
        active.insertText
      ) {
        applySuggestion(active);
        return;
      }

      // No-prefix mode: if a suggestion (app fuzzy match) is highlighted,
      // run it immediately rather than letting run() pick its own top match.
      if (!sigil && active?.runImmediately) {
        await active.runImmediately();
        setInput("");
        setHistoryIdx(null);
        return;
      }

      // Default: dispatch via run() — handles /commands, ?-help, and
      // no-prefix fuzzy app launch as a fallback.
      setBusy(true);
      try {
        await run(trimmed, teamId);
      } finally {
        setBusy(false);
      }
      setInput("");
      setHistoryIdx(null);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const active = suggestions[activeSuggestion];
      if (active) {
        applySuggestion(active, /* runIfImmediate */ false);
        // Defensive: setInput → re-render occasionally drops focus on the
        // input element. Restore on the next frame so the user can keep typing.
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      return;
    }
    if (e.key === "ArrowDown") {
      if (suggestions.length) {
        e.preventDefault();
        setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
      }
      return;
    }
    if (e.key === "ArrowUp") {
      if (suggestions.length) {
        e.preventDefault();
        setActiveSuggestion((i) => Math.max(i - 1, 0));
      }
      return;
    }
    if (e.key === "Escape") {
      setSuggestions([]);
      return;
    }
    // History: only when input is empty or matches the snapshot
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !suggestions.length) {
      // unreachable due to earlier branches but kept for clarity
    }
    if (e.key === "ArrowUp" && !suggestions.length && history.length > 0) {
      e.preventDefault();
      const next =
        historyIdx === null ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(next);
      setInput(history[next]);
    }
    if (
      e.key === "ArrowDown" &&
      !suggestions.length &&
      historyIdx !== null
    ) {
      e.preventDefault();
      if (historyIdx >= history.length - 1) {
        setHistoryIdx(null);
        setInput("");
      } else {
        const next = historyIdx + 1;
        setHistoryIdx(next);
        setInput(history[next]);
      }
    }
  };

  const applySuggestion = (s: SuggestionItem, runIfImmediate = true) => {
    if (s.runImmediately) {
      // Tab → just put the matched name in the input so the user can refine
      // or hit Enter. Enter / mouse pick → run immediately as before.
      if (runIfImmediate) {
        void s.runImmediately();
        setInput("");
        return;
      }
      const fill =
        s.insertText ?? (typeof s.label === "string" ? s.label : "");
      if (fill) setInput(fill);
      return;
    }
    if (s.insertText) {
      // In `/` mode the suggestion's insertText is the bare command
      // expression — re-attach the slash so the input stays well-formed.
      const prefix = sigil?.sigil === "/" ? "/" : "";
      setInput(prefix + s.insertText + " ");
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span>Workbench Console</span>
        <span className={styles.spacer} />
        {showClose && (
          <Button
            appearance="subtle"
            size="small"
            icon={<DismissRegular />}
            onClick={onClose}
          />
        )}
      </div>

      <div className={styles.scroll} ref={scrollRef}>
        {blocks.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
      </div>

      {visible && suggestions.length > 0 && (
        <div
          className={styles.suggestionsOverlay}
          role="listbox"
          aria-label="Console suggestions"
        >
          {suggestions.map((s, i) => (
            <div
              key={s.id}
              ref={(el) => {
                suggestionRefs.current[i] = el;
              }}
              className={mergeClasses(
                styles.suggestionItem,
                i === activeSuggestion && styles.suggestionItemActive,
              )}
              role="option"
              aria-selected={i === activeSuggestion}
              onMouseEnter={() => setActiveSuggestion(i)}
              onMouseDown={(e) => {
                // Use mousedown to apply BEFORE the input loses focus.
                e.preventDefault();
                applySuggestion(s);
              }}
            >
              {s.icon}
              <span className={styles.suggestionLabel}>{s.label}</span>
              {s.hint && (
                <span className={styles.suggestionHint}>{s.hint}</span>
              )}
              {s.category && (
                <span className={styles.suggestionCategory}>
                  {s.category}
                </span>
              )}
            </div>
          ))}
          <div className={styles.suggestionsFooter}>
            <span>
              <span className={styles.kbd}>↑</span>{" "}
              <span className={styles.kbd}>↓</span> navigate{"  "}
              <span className={styles.kbd}>Tab</span> insert{"  "}
              <span className={styles.kbd}>Enter</span> run
            </span>
            <span>{suggestions.length} match{suggestions.length === 1 ? "" : "es"}</span>
          </div>
        </div>
      )}

      <div className={styles.inputArea}>
        <div className={styles.inputRow}>
          <ChevronRightRegular className={styles.inputPrompt} />
          <div className={styles.inputWrap}>
            <div className={styles.inputOverlay}>
              <span className={styles.inputOverlayHidden}>{input}</span>
              {ghost && <span className={styles.inputGhost}>{ghost}</span>}
            </div>
            <input
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setHistoryIdx(null);
              }}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoComplete="off"
              // Intentionally NOT `disabled={busy}` — disabling the input would
              // strip focus and the user would have to click back in after each
              // command. The Enter handler early-returns when busy instead.
              aria-busy={busy}
              placeholder="Type to search apps, / for commands, ? for help"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── output renderer ────────────────────────────────────────────────────────

function BlockView({ block }: { block: OutputBlock }) {
  const styles = useStyles();
  switch (block.kind) {
    case "command":
      return (
        <div className={styles.blockCommand}>
          <span className={styles.prompt}>›</span>
          <span>{block.text}</span>
        </div>
      );
    case "text": {
      const cls =
        block.tone === "muted"
          ? styles.blockMuted
          : block.tone === "error"
            ? styles.blockError
            : block.tone === "success"
              ? styles.blockSuccess
              : undefined;
      return <div className={mergeClasses(styles.blockText, cls)}>{block.text}</div>;
    }
    case "node":
      return <div>{block.node}</div>;
    case "table":
      return (
        <table className={styles.table}>
          <thead>
            <tr>
              {block.columns.map((c, i) => (
                <th key={i} className={styles.th}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className={styles.td}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

// ── sigil-mode suggestions (synchronous; reads cached apps) ───────────────

function suggestForSigil(
  sigil: Sigil,
  query: string,
  teamId: string,
): SuggestionItem[] {
  if (sigil === "?") {
    return [
      {
        id: "help",
        label: "help",
        hint: "Type ? alone, then Enter, for the help block",
        category: "help",
      },
    ];
  }
  const apps = getCachedApps(teamId);
  if (apps.length === 0) return [];

  const q = query.toLowerCase();

  // Per-sigil match strategy + the field used for fuzzy ranking.
  let candidates: { app: AppCard; field: string }[];
  switch (sigil) {
    case "#":
      candidates = apps
        .filter((a) => a.tags.length > 0)
        .flatMap((a) => a.tags.map((t) => ({ app: a, field: t })));
      break;
    case "@":
      candidates = apps.map((a) => ({ app: a, field: a.name }));
      break;
    case ":":
      candidates = apps.flatMap((a) => {
        try {
          return [{ app: a, field: new URL(a.url).hostname }];
        } catch {
          return [];
        }
      });
      break;
    case "!":
      // TODO(console-sigil-group): read user prefs (groups) so `!` filters by
      // the user's personal group names. For now, no results.
      return [];
    default:
      return [];
  }

  if (!q) {
    // No query yet → preview all matches up to a cap.
    return candidates.slice(0, 12).map(({ app }) => ({
      id: `${sigil}-${app.id}`,
      label: app.name,
      hint: app.url,
      category: "app",
      runImmediately: () => {
        window.open(app.url, "_blank", "noopener,noreferrer");
      },
    }));
  }

  const ranked = fuzzySort(candidates, q, (c) => c.field);
  // Dedupe by app id (a tag-match might match the same app twice).
  const seen = new Set<string>();
  const out: SuggestionItem[] = [];
  for (const { item } of ranked) {
    if (seen.has(item.app.id)) continue;
    seen.add(item.app.id);
    out.push({
      id: `${sigil}-${item.app.id}`,
      label: item.app.name,
      hint: item.app.url,
      category: "app",
      runImmediately: () => {
        window.open(item.app.url, "_blank", "noopener,noreferrer");
      },
    });
    if (out.length >= 12) break;
  }
  return out;
}
