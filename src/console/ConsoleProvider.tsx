/**
 * ConsoleProvider — shared scrollback, history, input value, and dispatcher
 * across the dedicated Console page and the bottom drawer.
 *
 * Scrollback / history / input are kept in sessionStorage so a refresh
 * preserves the in-flight session within the same tab (per user decision).
 * Closing the tab clears them.
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
import { useNavigate } from "react-router-dom";
import type { Command, CommandContext, OutputBlock } from "./types";
import { parseInput, runParsed } from "./dispatch";
import { getCachedApps } from "./dataCache";
import { fuzzySort } from "./fuzzy";

const SCROLLBACK_KEY = "workbench:console:scrollback";
const HISTORY_KEY = "workbench:console:history";
const INPUT_KEY = "workbench:console:input";

type ConsoleState = {
  blocks: OutputBlock[];
  history: string[];
  input: string;
  drawerOpen: boolean;
};

type ConsoleApi = ConsoleState & {
  setInput: (next: string) => void;
  setDrawerOpen: (open: boolean) => void;
  clear: () => void;
  /** Run the given input, appending the echo + handler output to scrollback. */
  run: (raw: string, teamId: string) => Promise<void>;
  /** Read-only snapshot of registered commands. */
  registry: Command[];
};

const ConsoleContext = createContext<ConsoleApi | null>(null);

function loadScrollback(): OutputBlock[] {
  try {
    const raw = sessionStorage.getItem(SCROLLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Only keep blocks whose shape is fully serialisable. Drop anything that
    // looks like a stale "node" / "table" block (which carry ReactElement
    // objects that don't survive JSON round-trips).
    return parsed.filter((b: unknown): b is OutputBlock => {
      if (!b || typeof b !== "object") return false;
      const r = b as { kind?: unknown; text?: unknown; ts?: unknown };
      if (typeof r.ts !== "number") return false;
      if (r.kind === "command" || r.kind === "text") {
        return typeof r.text === "string";
      }
      return false;
    });
  } catch {
    return [];
  }
}

function loadHistory(): string[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

function loadInput(): string {
  return sessionStorage.getItem(INPUT_KEY) ?? "";
}

type Props = {
  children: ReactNode;
  registry: Command[];
};

export function ConsoleProvider({ children, registry }: Props) {
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<OutputBlock[]>(loadScrollback);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [input, setInputState] = useState<string>(loadInput);
  const [drawerOpen, setDrawerOpenState] = useState(false);

  // Note: persistence is throttled via JSON.stringify on each change. Cheap
  // for the volumes a console produces (~kB).
  useEffect(() => {
    try {
      // Drop blocks that contain non-serialisable React children. JSON.stringify
      // turns ReactElement objects into plain `{type,key,props,_owner,_store}`
      // bags, which then crash with "Objects are not valid as a React child"
      // when React tries to render them on next page load.
      const slim = blocks.filter(
        (b) => b.kind !== "node" && b.kind !== "table",
      );
      sessionStorage.setItem(SCROLLBACK_KEY, JSON.stringify(slim));
    } catch {
      /* quota or serialise error: drop */
    }
  }, [blocks]);

  useEffect(() => {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-100)));
  }, [history]);

  useEffect(() => {
    sessionStorage.setItem(INPUT_KEY, input);
  }, [input]);

  const append = useCallback((b: OutputBlock) => {
    setBlocks((prev) => [...prev, b]);
  }, []);

  const setInput = useCallback((next: string) => {
    setInputState(next);
  }, []);

  const setDrawerOpen = useCallback((open: boolean) => {
    setDrawerOpenState(open);
  }, []);

  const clear = useCallback(() => {
    setBlocks([]);
    sessionStorage.removeItem(SCROLLBACK_KEY);
  }, []);

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const run = useCallback(
    async (raw: string, teamId: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      const ts = Date.now();
      append({ kind: "command", text: trimmed, ts });
      setHistory((prev) =>
        prev[prev.length - 1] === trimmed ? prev : [...prev, trimmed],
      );

      const ctx: CommandContext = {
        teamId,
        print: (b) => append({ ...b, ts: Date.now() }),
        println: (text, tone) =>
          append({ kind: "text", text, tone, ts: Date.now() }),
        setInput,
        navigate: (path) => navigateRef.current(path),
      };

      // `?` is help shorthand even without `/`.
      if (trimmed === "?") {
        const helpCmd = registry.find((c) => c.id === "help");
        if (helpCmd) await helpCmd.run(ctx, {});
        return;
      }

      // `/` introduces command mode. Strip and parse the rest.
      if (trimmed.startsWith("/")) {
        const inner = trimmed.slice(1).trim();
        if (!inner) {
          ctx.println(`Type / followed by a command. /help for the list.`, "muted");
          return;
        }
        // Built-in: /clear, /history (don't need a CommandContext dance).
        if (inner === "clear") {
          clear();
          return;
        }
        if (inner === "history") {
          for (const h of history) {
            append({ kind: "text", text: h, tone: "muted", ts: Date.now() });
          }
          return;
        }
        const parsed = parseInput(inner, registry);
        if (!parsed.command) {
          ctx.println(
            `Unknown command: "/${inner.split(" ")[0]}". /help for the list.`,
            "error",
          );
          return;
        }
        if (!parsed.ready) {
          ctx.println(
            `Missing arguments for "/${parsed.command.name}". /help for usage.`,
            "error",
          );
          return;
        }
        try {
          await runParsed(parsed, ctx);
        } catch (e) {
          ctx.println(
            `Error: ${e instanceof Error ? e.message : String(e)}`,
            "error",
          );
        }
        return;
      }

      // No-prefix: fuzzy-launch an app by name.
      const apps = getCachedApps(teamId);
      const ranked = fuzzySort(apps, trimmed, (a) => a.name);
      const top = ranked[0]?.item;
      if (top) {
        window.open(top.url, "_blank", "noopener,noreferrer");
        ctx.println(`opened ${top.name}`, "success");
        return;
      }
      ctx.println(
        `No match for "${trimmed}". Type / for commands, ? for help.`,
        "error",
      );
    },
    [append, clear, history, registry, setInput],
  );

  const api = useMemo<ConsoleApi>(
    () => ({
      blocks,
      history,
      input,
      drawerOpen,
      setInput,
      setDrawerOpen,
      clear,
      run,
      registry,
    }),
    [blocks, history, input, drawerOpen, setInput, setDrawerOpen, clear, run, registry],
  );

  return (
    <ConsoleContext.Provider value={api}>{children}</ConsoleContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConsole(): ConsoleApi {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used within ConsoleProvider");
  return ctx;
}
