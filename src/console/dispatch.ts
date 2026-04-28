/**
 * Console dispatcher — parses input strings into commands + args, drives
 * suggestions, and runs handlers.
 */

import { createElement, Fragment, type ReactNode } from "react";
import type {
  ArgSpec,
  Command,
  CommandContext,
  ParsedInput,
  SuggestionItem,
} from "./types";
import { fuzzyScore } from "./fuzzy";

export const SIGILS = ["/", "?", "#", "!", "@", ":"] as const;
export type Sigil = (typeof SIGILS)[number];

/** Tokenise an args string. Honours single/double quoted spans. */
export function tokenise(input: string): {
  tokens: string[];
  endsWithSpace: boolean;
  trailingToken: string;
} {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === " ") {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  const endsWithSpace = input.length > 0 && input.endsWith(" ") && !quote;
  if (cur) out.push(cur);
  const trailingToken = endsWithSpace ? "" : (out[out.length - 1] ?? "");
  return { tokens: out, endsWithSpace, trailingToken };
}

/** Detect a sigil prefix. Spaces between sigil and query are tolerated. */
export function detectSigil(
  raw: string,
): { sigil: Sigil; query: string } | null {
  const trimmed = raw.trimStart();
  if (!trimmed) return null;
  const ch = trimmed[0];
  if ((SIGILS as readonly string[]).includes(ch)) {
    return {
      sigil: ch as Sigil,
      query: trimmed.slice(1).trimStart(),
    };
  }
  return null;
}

/**
 * Parse the input against the registry. The cursor is assumed at the very
 * end of the string (the input box always edits at the end for now).
 */
export function parseInput(
  raw: string,
  registry: Command[],
): ParsedInput {
  const cleaned = raw.replace(/^\s+/, "").replace(/\s+/g, " ");
  if (!cleaned) {
    return {
      command: null,
      remainder: "",
      args: {},
      cursorArg: null,
      cursorToken: "",
      ready: false,
    };
  }

  // Find command by longest-matching name. Command names can contain spaces
  // ("todos list", "sets switch"), so we try the longest prefix first.
  const endsWithSpaceRaw = raw.length > 0 && raw.endsWith(" ");
  let cmd: Command | null = null;
  let cmdName = "";
  const allNames: { c: Command; n: string }[] = [];
  for (const c of registry) {
    allNames.push({ c, n: c.name });
    for (const a of c.aliases ?? []) allNames.push({ c, n: a });
  }
  allNames.sort((a, b) => b.n.length - a.n.length);
  for (const { c, n } of allNames) {
    if (cleaned === n || cleaned.startsWith(n + " ")) {
      cmd = c;
      cmdName = n;
      break;
    }
  }
  const tailBody =
    cmd && cleaned.length > cmdName.length
      ? cleaned.slice(cmdName.length + 1)
      : "";
  // Re-attach trailing space so tokenise can detect "cursor in next arg".
  const tailRaw =
    endsWithSpaceRaw && !tailBody.endsWith(" ") ? tailBody + " " : tailBody;

  if (!cmd) {
    return {
      command: null,
      remainder: cleaned,
      args: {},
      cursorArg: null,
      cursorToken: cleaned,
      ready: false,
    };
  }

  const argSpecs = cmd.args ?? [];
  if (argSpecs.length === 0) {
    return {
      command: cmd,
      remainder: "",
      args: {},
      cursorArg: null,
      cursorToken: "",
      ready: true,
    };
  }

  const { tokens, endsWithSpace, trailingToken } = tokenise(tailRaw);

  const args: Record<string, string> = {};
  let consumed = 0;
  for (let i = 0; i < argSpecs.length; i++) {
    const spec = argSpecs[i];
    if (spec.rest) {
      // Capture all remaining input verbatim (after trimming leading space).
      args[spec.name] = tokens.slice(consumed).join(" ");
      consumed = tokens.length;
      break;
    }
    if (consumed < tokens.length - (endsWithSpace ? 0 : 1)) {
      // Token fully present (there's a token after this one or trailing space).
      args[spec.name] = tokens[consumed];
      consumed++;
    } else if (consumed === tokens.length - 1 && !endsWithSpace) {
      // Last typed token = currently being edited. Stash partial value.
      args[spec.name] = tokens[consumed];
      consumed++;
    } else {
      break;
    }
  }

  // Determine cursor arg: the next un-filled / partially-filled arg.
  let cursorArg: ArgSpec | null = null;
  if (endsWithSpace) {
    // After space: cursor is in the next un-filled arg.
    const nextIdx = tokens.length;
    cursorArg = argSpecs[nextIdx] ?? null;
  } else if (tokens.length > 0) {
    // Mid-token: cursor is in arg at index (tokens.length - 1).
    cursorArg = argSpecs[tokens.length - 1] ?? null;
  } else {
    cursorArg = argSpecs[0] ?? null;
  }

  // Are all required args filled?
  const ready = argSpecs.every(
    (s) => s.optional || s.rest || (args[s.name] && args[s.name].length > 0),
  );

  return {
    command: cmd,
    remainder: tailRaw,
    args,
    cursorArg,
    cursorToken: trailingToken,
    ready,
  };
}

/** Build the italic ghost-text shown after the user's input. */
export function ghostTextFor(parsed: ParsedInput, raw: string): string {
  if (!parsed.command) return "";
  if (!parsed.cursorArg) return "";
  // Show the hint for the current arg, with a leading space if needed.
  const needsLeadingSpace = !raw.endsWith(" ");
  return (needsLeadingSpace ? " " : "") + parsed.cursorArg.hint;
}

/** Execute the parsed command. Caller verified parsed.ready beforehand. */
export async function runParsed(
  parsed: ParsedInput,
  ctx: CommandContext,
): Promise<void> {
  if (!parsed.command) return;
  await parsed.command.run(ctx, parsed.args);
}

/** Compute suggestions for the current cursor position (synchronous). */
export function suggestionsFor(
  parsed: ParsedInput,
  ctx: CommandContext,
  registry: Command[],
): SuggestionItem[] {
  // No command yet → fuzzy-rank commands by name + summary.
  if (!parsed.command) {
    const q = parsed.cursorToken;
    const ranked = registry
      .map((c) => {
        if (!q) return { c, score: 0, indices: [] as number[] };
        // Best of: name, alias, summary.
        const candidates = [c.name, ...(c.aliases ?? []), c.summary];
        let best = { score: -1, indices: [] as number[] };
        for (const cand of candidates) {
          const m = fuzzyScore(cand, q);
          if (m.score > best.score) best = m;
        }
        return { c, score: best.score, indices: best.indices };
      })
      .filter((x) => x.score >= 0);
    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, 12).map(({ c, indices }) => ({
      id: c.id,
      label:
        q && indices.length > 0 && c.name.toLowerCase().includes(q.toLowerCase())
          ? highlightSpans(c.name, indices)
          : c.name,
      hint: c.summary,
      category: "cmd",
      insertText: c.name + (c.args?.length ? " " : ""),
    }));
  }

  // Have command + cursor on an arg → ask the command for completions.
  if (parsed.cursorArg && parsed.command.suggest) {
    const list = parsed.command.suggest(
      ctx,
      parsed.cursorArg,
      parsed.cursorToken,
      parsed.args,
    );
    return list.slice(0, 12);
  }

  return [];
}

function highlightSpans(label: string, indices: number[]): ReactNode {
  const set = new Set(indices);
  const out: ReactNode[] = [];
  for (let i = 0; i < label.length; i++) {
    if (set.has(i)) {
      out.push(
        createElement(
          "mark",
          {
            key: i,
            style: {
              background: "transparent",
              color: "inherit",
              fontWeight: 600,
            },
          },
          label[i],
        ),
      );
    } else {
      out.push(label[i]);
    }
  }
  return createElement(Fragment, null, ...out);
}
