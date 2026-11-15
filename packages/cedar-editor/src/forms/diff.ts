/** Minimal line diff used for the pre-activation review. Not a semantic diff. */
export interface DiffLine {
  readonly kind: "same" | "add" | "remove";
  readonly text: string;
  readonly oldLine: number | null;
  readonly newLine: number | null;
}

export interface LineDiff {
  readonly lines: readonly DiffLine[];
  readonly added: number;
  readonly removed: number;
  readonly truncated: boolean;
}

const MAX_LINES = 800;

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Longest-common-subsequence line diff with a bounded matrix.
 * Lines beyond {@link MAX_LINES} are reported as truncated rather than diffed.
 */
export function diffLines(before: string, after: string): LineDiff {
  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  const truncated = oldLines.length > MAX_LINES || newLines.length > MAX_LINES;
  const a = oldLines.slice(0, MAX_LINES);
  const b = newLines.slice(0, MAX_LINES);

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = matrix[i];
    const nextRow = matrix[i + 1];
    if (row === undefined || nextRow === undefined) continue;
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const aLine = a[i];
      const bLine = b[j];
      row[j] =
        aLine === bLine
          ? (nextRow[j + 1] ?? 0) + 1
          : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    const aLine = a[i] ?? "";
    const bLine = b[j] ?? "";
    if (aLine === bLine) {
      lines.push({
        kind: "same",
        text: aLine,
        oldLine: i + 1,
        newLine: j + 1,
      });
      i += 1;
      j += 1;
      continue;
    }
    const down = matrix[i + 1]?.[j] ?? 0;
    const right = matrix[i]?.[j + 1] ?? 0;
    if (down >= right) {
      lines.push({ kind: "remove", text: aLine, oldLine: i + 1, newLine: null });
      removed += 1;
      i += 1;
    } else {
      lines.push({ kind: "add", text: bLine, oldLine: null, newLine: j + 1 });
      added += 1;
      j += 1;
    }
  }

  while (i < a.length) {
    lines.push({
      kind: "remove",
      text: a[i] ?? "",
      oldLine: i + 1,
      newLine: null,
    });
    removed += 1;
    i += 1;
  }
  while (j < b.length) {
    lines.push({ kind: "add", text: b[j] ?? "", oldLine: null, newLine: j + 1 });
    added += 1;
    j += 1;
  }

  return { lines, added, removed, truncated };
}
