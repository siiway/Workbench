/**
 * Console types — command registry, output blocks, suggestions.
 */

import type { ReactNode } from "react";

export type ArgKind =
  | { kind: "text"; placeholder?: string }
  | { kind: "todoId" }
  | { kind: "appName" }
  | { kind: "setName" }
  | { kind: "navTarget" }
  | { kind: "enum"; options: string[] };

export type ArgSpec = {
  /** Internal name for the parsed arg map. */
  name: string;
  /** Italic ghost text shown after the partially-typed command. */
  hint: string;
  kind: ArgKind;
  optional?: boolean;
  /** When true, all remaining input (including spaces) is captured here. */
  rest?: boolean;
};

export type ParsedInput = {
  command: Command | null;
  /** Raw remaining string after the command name (for ghost-text rendering). */
  remainder: string;
  /** Args parsed so far, indexed by arg.name. May be partial. */
  args: Record<string, string>;
  /** Which arg the user is currently in the middle of typing (for suggestions). */
  cursorArg: ArgSpec | null;
  /** The current token under the cursor (for suggestion filtering). */
  cursorToken: string;
  /** True when every required arg is filled and the command is ready to run. */
  ready: boolean;
};

export type SuggestionItem = {
  /** Stable ID for the listbox. */
  id: string;
  /** Primary label shown — may include highlighted match spans. */
  label: ReactNode;
  /** Optional secondary label (right-aligned, dim). */
  hint?: string;
  /** Optional inline icon. */
  icon?: ReactNode;
  /** Tag or category hint shown left of the label. */
  category?: string;
  /**
   * The full command string this suggestion will be inserted into the input.
   * If absent, the label (when string) is used.
   */
  insertText?: string;
  /**
   * If set, choosing this suggestion runs immediately instead of inserting.
   * Used for "fuzzy match a resource" mode where the resource IS the action.
   */
  runImmediately?: () => void | Promise<void>;
};

export type OutputBlock =
  | { kind: "command"; text: string; ts: number }
  | { kind: "text"; text: string; tone?: "default" | "muted" | "error" | "success"; ts: number }
  | { kind: "node"; node: ReactNode; ts: number }
  | { kind: "table"; columns: string[]; rows: ReactNode[][]; ts: number };

export type PrintInput =
  | { kind: "command"; text: string }
  | { kind: "text"; text: string; tone?: "default" | "muted" | "error" | "success" }
  | { kind: "node"; node: ReactNode }
  | { kind: "table"; columns: string[]; rows: ReactNode[][] };

/**
 * Context passed to command handlers. Stays small on purpose — anything bigger
 * (apps cache, todos cache) is fetched fresh inside the handler so commands
 * don't go stale across long-lived console sessions.
 */
export type CommandContext = {
  teamId: string;
  /** Append a single output block (after the implicit echo of the command). */
  print: (block: PrintInput) => void;
  /** Append a plain-text line. */
  println: (text: string, tone?: "default" | "muted" | "error" | "success") => void;
  /** Replace the input box content (e.g. for `claim` requesting a todo arg). */
  setInput: (next: string) => void;
  /** Navigate to a Workbench route. */
  navigate: (path: string) => void;
};

export type Command = {
  /** Unique id, e.g. "todos.claim". */
  id: string;
  /** Token typed first, e.g. "claim". Aliases listed too. */
  name: string;
  aliases?: string[];
  /** One-line description for help. */
  summary: string;
  /** Args, in positional order. */
  args?: ArgSpec[];
  /** Run with parsed args. */
  run: (ctx: CommandContext, args: Record<string, string>) => void | Promise<void>;
  /**
   * Synchronous suggester. Reads from the in-memory cache so suggestions
   * update on every keystroke without a network round-trip.
   */
  suggest?: (
    ctx: CommandContext,
    cursorArg: ArgSpec,
    token: string,
    args: Record<string, string>,
  ) => SuggestionItem[];
};
