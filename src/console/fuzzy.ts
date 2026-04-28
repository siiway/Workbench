/**
 * Tiny fuzzy matcher. Scores a target string against a query and returns a
 * relevance score plus the indices of matched characters (for highlighting).
 *
 * Heuristic: prefer prefix matches > word-boundary matches > subsequence
 * matches; later positions and longer gaps reduce the score.
 */

export type FuzzyMatch = {
  /** Higher is better; ≥ 0 means "matches", < 0 means no match. */
  score: number;
  /** Indices of matched characters in `target`. */
  indices: number[];
};

const NO_MATCH: FuzzyMatch = { score: -1, indices: [] };

export function fuzzyScore(target: string, query: string): FuzzyMatch {
  if (!query) return { score: 0, indices: [] };
  const t = target.toLowerCase();
  const q = query.toLowerCase();

  // Hard exact / prefix wins.
  if (t === q) return { score: 1000, indices: range(0, q.length) };
  if (t.startsWith(q)) return { score: 800 - q.length, indices: range(0, q.length) };

  // Substring match (any position).
  const sub = t.indexOf(q);
  if (sub >= 0) {
    return { score: 500 - sub, indices: range(sub, sub + q.length) };
  }

  // Subsequence match: each query char must appear in order in target.
  const indices: number[] = [];
  let ti = 0;
  let lastMatch = -1;
  let gaps = 0;
  let wordBoundaryHits = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const qc = q[qi];
    let found = -1;
    for (let i = ti; i < t.length; i++) {
      if (t[i] === qc) {
        found = i;
        break;
      }
    }
    if (found < 0) return NO_MATCH;
    indices.push(found);
    if (lastMatch >= 0) gaps += found - lastMatch - 1;
    if (found === 0 || /[\s_/.\-:]/.test(t[found - 1] ?? "")) {
      wordBoundaryHits++;
    }
    lastMatch = found;
    ti = found + 1;
  }
  // Score: positive subsequence base, minus gap penalty, plus word-boundary bonus.
  const score = 200 - gaps + wordBoundaryHits * 10 - (t.length - q.length) / 4;
  return { score, indices };
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i < b; i++) out.push(i);
  return out;
}

/** Sort items by their fuzzy score against `query`; drops non-matches. */
export function fuzzySort<T>(
  items: T[],
  query: string,
  field: (t: T) => string,
): { item: T; match: FuzzyMatch }[] {
  if (!query) {
    return items.map((item) => ({
      item,
      match: { score: 0, indices: [] },
    }));
  }
  const scored = items
    .map((item) => ({ item, match: fuzzyScore(field(item), query) }))
    .filter((x) => x.match.score >= 0);
  scored.sort((a, b) => b.match.score - a.match.score);
  return scored;
}
