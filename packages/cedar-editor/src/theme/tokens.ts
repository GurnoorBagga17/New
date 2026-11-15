/**
 * Design-token bridge.
 *
 * The single source of truth is `/tokens.json` (Team 0 + Team 7). This package
 * never hardcodes a colour: it either installs tokens into CSS custom
 * properties (Storybook/dev harness) or reads the already-installed variables
 * from the document (gateway-ui, where `@axiom/ui` owns the token build).
 *
 * `tokens.json` is intentionally not imported at runtime, because it lives
 * outside the published package. Hosts pass it to {@link installDesignTokens}
 * or provide the CSS variables themselves.
 */

export type ThemeMode = "dark" | "light";

interface TokenLeaf {
  readonly $type?: string;
  readonly $value?: unknown;
}

type TokenTree = { readonly [key: string]: TokenLeaf | TokenTree };

export interface DesignTokensJson {
  readonly dark: TokenTree;
  readonly light: TokenTree;
  readonly shared?: TokenTree;
}

export type DesignTokenMap = Readonly<Record<string, string>>;

/** Colour token names expected under `dark` / `light` in tokens.json. */
const COLOR_KEYS = [
  "bg-canvas",
  "bg-surface-1",
  "bg-surface-2",
  "bg-surface-3",
  "border-subtle",
  "border-strong",
  "text-primary",
  "text-secondary",
  "text-muted",
  "brand-orange",
  "brand-orange-glow",
  "brand-indigo",
  "brand-indigo-glow",
  "brand-violet",
  "brand-violet-glow",
  "state-enforce",
  "state-enforce-tint",
  "state-observe",
  "state-observe-tint",
  "state-pending",
  "state-pending-tint",
  "state-deny",
  "state-deny-tint",
  "state-revoked",
  "state-revoked-tint",
] as const;

/** Variables Monaco/the studio stylesheet must be able to resolve. */
export const REQUIRED_CSS_VARIABLES = [
  "--bg-surface-2",
  "--bg-surface-3",
  "--border-subtle",
  "--border-strong",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--brand-orange",
  "--brand-indigo",
  "--brand-violet",
  "--state-enforce",
  "--state-observe",
  "--state-pending",
  "--state-deny",
  "--state-revoked",
  "--font-mono",
  "--font-sans",
  "--radius-input",
  "--radius-card",
] as const;

export class MissingDesignTokensError extends Error {
  override readonly name = "MissingDesignTokensError";

  constructor(readonly missing: readonly string[]) {
    super(
      `Missing design tokens: ${missing.join(", ")}. This UI must compile from /tokens.json; no fallback hex values are permitted.`,
    );
  }
}

function isTokenTree(value: unknown): value is TokenTree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readLeaf(tree: TokenTree, path: readonly string[]): unknown {
  let current: unknown = tree;
  for (const key of path) {
    if (!isTokenTree(current)) return undefined;
    current = current[key];
    if (current === undefined) return undefined;
  }
  if (!isTokenTree(current)) {
    return (current as TokenLeaf).$value;
  }
  return undefined;
}

/** Build a flat token map for one theme from the design-token JSON. */
export function tokenMapFromTokensJson(
  tokens: DesignTokensJson,
  mode: ThemeMode,
): DesignTokenMap {
  const themeTree = mode === "dark" ? tokens.dark : tokens.light;
  const output: Record<string, string> = {};

  for (const key of COLOR_KEYS) {
    // `/tokens.json` suffixes colour primitives with the mode
    // (`color.bg-surface-2-dark`), while CSS variables are mode-independent.
    const value =
      readLeaf(themeTree, ["color", key]) ??
      readLeaf(themeTree, ["color", `${key}-${mode}`]);
    if (typeof value === "string") output[`--${key}`] = value;
  }

  const shared = tokens.shared;
  if (shared !== undefined) {
    const radii: Array<[string, string]> = [
      ["input", "--radius-input"],
      ["card", "--radius-card"],
      ["modal", "--radius-modal"],
    ];
    for (const [tokenName, cssName] of radii) {
      const value = readLeaf(shared, ["radii", tokenName]);
      if (typeof value === "string") output[cssName] = value;
    }

    const families: Array<[string, string]> = [
      ["display", "--font-display"],
      ["sans", "--font-sans"],
      ["mono", "--font-mono"],
    ];
    for (const [tokenName, cssName] of families) {
      const value = readLeaf(shared, [
        "typography",
        "font-family",
        tokenName,
      ]);
      if (typeof value === "string") output[cssName] = value;
    }

    const border = readLeaf(shared, ["elevation", "surface-border"]);
    if (typeof border === "string") output["--elevation-border"] = border;
    const highlight = readLeaf(shared, ["elevation", "top-edge-highlight"]);
    if (typeof highlight === "string") {
      output["--elevation-top-highlight"] = highlight;
    }
  }

  return output;
}

/**
 * Install tokens on a document for Storybook, tests, or a standalone harness.
 * Production `apps/gateway-ui` gets the same variables from `@axiom/ui`.
 */
export function installDesignTokens(
  documentRef: Document,
  tokens: DesignTokensJson,
  mode: ThemeMode,
): DesignTokenMap {
  const map = tokenMapFromTokensJson(tokens, mode);
  const root = documentRef.documentElement;
  root.setAttribute("data-theme", mode);
  for (const [name, value] of Object.entries(map)) {
    root.style.setProperty(name, value);
  }
  return map;
}

const TOKEN_FALLBACK_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "--font-mono": ["--typography-font-family-mono"],
  "--font-sans": ["--typography-font-family-sans"],
  "--radius-input": ["--radii-input"],
  "--radius-card": ["--radii-card"],
};

/** Read installed variables. Throws if the token build did not run. */
export function readDesignTokensFromDocument(
  documentRef: Document,
): DesignTokenMap {
  const styles = documentRef.defaultView?.getComputedStyle(
    documentRef.documentElement,
  );
  if (styles === undefined) {
    throw new MissingDesignTokensError([...REQUIRED_CSS_VARIABLES]);
  }
  const output: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of REQUIRED_CSS_VARIABLES) {
    let value = styles.getPropertyValue(name).trim();
    if (value.length === 0) {
      const aliases = TOKEN_FALLBACK_ALIASES[name];
      if (aliases !== undefined) {
        for (const alias of aliases) {
          const aliasVal = styles.getPropertyValue(alias).trim();
          if (aliasVal.length > 0) {
            value = aliasVal;
            break;
          }
        }
      }
    }
    if (value.length === 0) {
      missing.push(name);
    } else {
      output[name] = value;
    }
  }
  if (missing.length > 0) throw new MissingDesignTokensError(missing);
  return output;
}

/** Structural Monaco theme data; avoids importing monaco into the entry chunk. */
export interface MonacoThemeData {
  readonly base: "vs" | "vs-dark" | "hc-black" | "hc-light";
  readonly inherit: boolean;
  readonly rules: {
    readonly token: string;
    readonly foreground?: string;
    readonly background?: string;
    readonly fontStyle?: string;
  }[];
  readonly colors: Record<string, string>;
}

const required = (tokens: DesignTokenMap, name: string): string => {
  const value = tokens[name];
  if (value === undefined || value.trim().length === 0) {
    throw new MissingDesignTokensError([name]);
  }
  return value;
};

/**
 * Map design tokens to a Monaco theme.
 * All colours come from `tokens`; no literals live in this file.
 */
export function createCedarMonacoTheme(
  tokens: DesignTokenMap,
  mode: ThemeMode,
): MonacoThemeData {
  const background = required(tokens, "--bg-surface-2");
  const foreground = required(tokens, "--text-primary");
  const muted = required(tokens, "--text-muted");
  const secondary = required(tokens, "--text-secondary");
  const orange = required(tokens, "--brand-orange");
  const indigo = required(tokens, "--brand-indigo");
  const violet = required(tokens, "--brand-violet");
  const enforce = required(tokens, "--state-enforce");
  const pending = required(tokens, "--state-pending");
  const deny = required(tokens, "--state-deny");
  const observe = required(tokens, "--state-observe");
  const strong = required(tokens, "--border-strong");
  const subtle = required(tokens, "--border-subtle");

  return {
    base: mode === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "", foreground: foreground },
      { token: "comment", foreground: muted, fontStyle: "italic" },
      { token: "keyword", foreground: indigo, fontStyle: "bold" },
      { token: "keyword.control", foreground: orange },
      { token: "operator", foreground: orange },
      { token: "string", foreground: enforce },
      { token: "number", foreground: pending },
      { token: "type", foreground: violet },
      { token: "type.identifier", foreground: violet },
      { token: "identifier", foreground: foreground },
      { token: "delimiter", foreground: secondary },
      { token: "annotation", foreground: observe },
      { token: "invalid", foreground: deny },
    ],
    colors: {
      "editor.background": background,
      "editor.foreground": foreground,
      "editorLineNumber.foreground": muted,
      "editorLineNumber.activeForeground": secondary,
      "editorCursor.foreground": orange,
      "editor.selectionBackground": strong,
      "editor.inactiveSelectionBackground": subtle,
      "editorIndentGuide.background1": subtle,
      "editorIndentGuide.activeBackground1": strong,
      "editorWidget.background": required(tokens, "--bg-surface-3"),
      "editorWidget.border": subtle,
      "editorSuggestWidget.background": required(tokens, "--bg-surface-3"),
      "editorSuggestWidget.border": strong,
      "editorSuggestWidget.foreground": foreground,
      "editorSuggestWidget.highlightForeground": orange,
      "editorHoverWidget.background": required(tokens, "--bg-surface-3"),
      "editorHoverWidget.border": subtle,
      "editorError.foreground": deny,
      "editorWarning.foreground": pending,
      "editorInfo.foreground": observe,
      "editorGutter.background": background,
      "focusBorder": orange,
      "scrollbarSlider.background": strong,
      "scrollbarSlider.hoverBackground": orange,
      "scrollbarSlider.activeBackground": orange,
    },
  };
}
