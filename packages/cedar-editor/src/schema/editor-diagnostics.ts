/**
 * Editor-only syntax balance checks.
 *
 * These diagnostics help typing and are explicitly labelled `EDITOR`. They are
 * not policy validation; schema/type validation always comes from the backend
 * (`/v1/local/policies/dry-run`) or `@axiom/cedar-wasm`.
 */

export interface EditorDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly severity: "error" | "warning";
}

const OPENERS: Readonly<Record<string, string>> = {
  "(": ")",
  "{": "}",
  "[": "]",
};

const CLOSERS: Readonly<Record<string, string>> = {
  ")": "(",
  "}": "{",
  "]": "[",
};

interface Position {
  line: number;
  column: number;
}

/** Static balance scan; O(n) and allocation-light for typing latency. */
export function analyzeCedarText(source: string): readonly EditorDiagnostic[] {
  const diagnostics: EditorDiagnostic[] = [];
  if (source.trim().length === 0) {
    diagnostics.push({
      code: "EDITOR_EMPTY",
      message: "EDITOR: policy is empty. No candidate bundle can be validated.",
      line: 1,
      column: 1,
      severity: "warning",
    });
    return diagnostics;
  }

  const stack: Array<{ char: string; position: Position }> = [];
  let line = 1;
  let column = 1;
  let index = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let stringStart: Position = { line, column };

  const advance = (): void => {
    const char = source[index];
    if (char === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    index += 1;
  };

  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      advance();
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        advance();
        advance();
        continue;
      }
      advance();
      continue;
    }
    if (inString) {
      if (char === "\\") {
        advance();
        advance();
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      advance();
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      advance();
      advance();
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      advance();
      advance();
      continue;
    }
    if (char === '"') {
      inString = true;
      stringStart = { line, column };
      advance();
      continue;
    }
    if (char in OPENERS) {
      stack.push({ char, position: { line, column } });
      advance();
      continue;
    }
    if (char in CLOSERS) {
      const expected = CLOSERS[char];
      const top = stack.pop();
      if (top === undefined || top.char !== expected) {
        diagnostics.push({
          code: "EDITOR_UNBALANCED",
          message: `EDITOR: unexpected '${char}' at line ${line}, column ${column}.`,
          line,
          column,
          severity: "error",
        });
      }
      advance();
      continue;
    }
    advance();
  }

  if (inString) {
    diagnostics.push({
      code: "EDITOR_UNTERMINATED",
      message: `EDITOR: unterminated string literal starting at line ${stringStart.line}, column ${stringStart.column}.`,
      line: stringStart.line,
      column: stringStart.column,
      severity: "error",
    });
  }
  if (inBlockComment) {
    diagnostics.push({
      code: "EDITOR_UNTERMINATED",
      message: `EDITOR: unterminated block comment starting at line ${line}, column ${column}.`,
      line,
      column,
      severity: "error",
    });
  }
  for (const entry of stack) {
    diagnostics.push({
      code: "EDITOR_UNBALANCED",
      message: `EDITOR: '${entry.char}' opened at line ${entry.position.line}, column ${entry.position.column} is never closed.`,
      line: entry.position.line,
      column: entry.position.column,
      severity: "error",
    });
  }

  return diagnostics;
}
