/**
 * Monaco registration for Cedar. Loaded only with the lazy editor chunk.
 */
import * as monaco from "monaco-editor/editor/editor.api.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import {
  AXIOM_NAMESPACE,
  CEDAR_ACTIONS,
  CEDAR_ENTITY_TYPES,
  CEDAR_KEYWORDS,
  CEDAR_SET_METHODS,
  CEDAR_STRING_METHODS,
  contextAttributesFor,
  type ContextAttribute,
} from "../schema/axiom-cedarschema.js";
import type { EditorDiagnostic } from "../schema/editor-diagnostics.js";
import {
  createCedarMonacoTheme,
  type DesignTokenMap,
  type ThemeMode,
} from "../theme/tokens.js";

export const CEDAR_LANGUAGE_ID = "cedar";
export const CEDAR_DARK_THEME = "axiom-cedar-dark";
export const CEDAR_LIGHT_THEME = "axiom-cedar-light";
export const MARKER_OWNER = "axiom-cedar";

let workerFactory: (() => Worker) | null = null;
let languageRegistered = false;
let completionRegistered = false;
let hoverRegistered = false;

/** Next.js hosts can inject a webpack/turbopack worker factory here. */
export function setCedarWorkerFactory(factory: () => Worker): void {
  workerFactory = factory;
}

function configureEnvironment(): void {
  const globalScope = globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker: () => Worker };
  };
  globalScope.MonacoEnvironment = {
    getWorker: workerFactory ?? (() => new EditorWorker()),
  };
}

const monarchLanguage: monaco.languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".cedar",
  keywords: [...CEDAR_KEYWORDS],
  typeKeywords: ["Bool", "String", "Long", "Set", "Record"],
  entities: [...CEDAR_ENTITY_TYPES],
  operators: ["is", "in", "has", "like", "if", "then", "else"],
  tokenizer: {
    root: [
      [/\/\/.*$/, "comment"],
      [/\/\*/, "comment", "@comment"],
      [/\s+/, "white"],
      [/"(?:[^"\\]|\\.)*"/, "string"],
      [/\b(permit|forbid|when|unless)\b/, "keyword"],
      [/\b(namespace|entity|appliesTo)\b/, "keyword"],
      [/\b(principal|action|resource|context)\b/, "keyword.control"],
      [/\b(is|in|has|like|if|then|else)\b/, "operator"],
      [/\b(true|false)\b/, "number"],
      [/\b(Bool|String|Long|Set|Record)\b/, "type"],
      [
        new RegExp(`\\b(${AXIOM_NAMESPACE})\\b`),
        "type.identifier",
      ],
      [
        new RegExp(`\\b(${CEDAR_ENTITY_TYPES.join("|")})\\b`),
        "type.identifier",
      ],
      [/\b\d+\b/, "number"],
      [/(==|!=|<=|>=|&&|\|\||[=<>!])/, "operator"],
      [/[()[\]{},;:]/, "delimiter"],
      [/\b[A-Za-z_][A-Za-z0-9_]*\b/, "identifier"],
    ],
    comment: [
      [/[^/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[/*]/, "comment"],
    ],
  },
};

const languageConfiguration: monaco.languages.LanguageConfiguration = {
  comments: { lineComment: "//", blockComment: ["/*", "*/"] },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"', notIn: ["string", "comment"] },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
  ],
  indentationRules: {
    increaseIndentPattern: /^.*(\{|\(|\[)\s*(?:\/\/.*)?$/,
    decreaseIndentPattern: /^\s*(\}|\)|\])/,
  },
};

function attributeCompletion(
  attribute: ContextAttribute,
  range: monaco.IRange,
): monaco.languages.CompletionItem {
  return {
    label: attribute.name,
    kind: monaco.languages.CompletionItemKind.Field,
    detail: `${attribute.type} • ${attribute.source}`,
    documentation: {
      value: `${attribute.documentation}\n\nType: \`${attribute.type}\`\nSource: \`${attribute.source}\``,
    },
    insertText: attribute.name,
    sortText: `0-${attribute.name}`,
    range,
  };
}

function currentWordRange(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): monaco.IRange {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
}

function registerCompletions(): void {
  if (completionRegistered) return;
  completionRegistered = true;

  monaco.languages.registerCompletionItemProvider(CEDAR_LANGUAGE_ID, {
    triggerCharacters: [".", ":", '"'],
    provideCompletionItems(
      model: monaco.editor.ITextModel,
      position: monaco.Position,
    ) {
      const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const range = currentWordRange(model, position);

      if (/context\.\w*$/.test(linePrefix)) {
        return {
          suggestions: contextAttributesFor("tools/call").map((attribute) =>
            attributeCompletion(attribute, range),
          ),
        };
      }

      if (/Axiom::Action::"?\w*$/.test(linePrefix)) {
        return {
          suggestions: CEDAR_ACTIONS.map((action, index) => ({
            label: action,
            kind: monaco.languages.CompletionItemKind.EnumMember,
            detail: "MCP action",
            insertText: action,
            sortText: `0-${index}`,
            range,
          })),
        };
      }

      const suggestions: monaco.languages.CompletionItem[] = [];

      for (const keyword of CEDAR_KEYWORDS) {
        suggestions.push({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          sortText: `1-${keyword}`,
          range,
        });
      }
      for (const entity of CEDAR_ENTITY_TYPES) {
        suggestions.push({
          label: `${AXIOM_NAMESPACE}::${entity}`,
          kind: monaco.languages.CompletionItemKind.Class,
          detail: "entity type",
          insertText: `${AXIOM_NAMESPACE}::${entity}`,
          sortText: `2-${entity}`,
          range,
        });
      }
      for (const method of [...CEDAR_SET_METHODS, ...CEDAR_STRING_METHODS]) {
        suggestions.push({
          label: method,
          kind: monaco.languages.CompletionItemKind.Method,
          detail: "Cedar extension method",
          insertText: method,
          sortText: `3-${method}`,
          range,
        });
      }
      suggestions.push({
        label: "permit tools/call template",
        kind: monaco.languages.CompletionItemKind.Snippet,
        detail: "Axiom Phase 1 permit skeleton",
        insertText: [
          "permit (",
          "    principal is Axiom::Agent,",
          '    action == Axiom::Action::"tools/call",',
          "    resource is Axiom::Tool",
          ")",
          "when {",
          "    context.authenticated == true &&",
          "    context.validator_passed == true &&",
          "    context.tool_pin_verified == true",
          "};",
        ].join("\n"),
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: "4-template",
        range,
      });

      return { suggestions };
    },
  });
}

function registerHover(): void {
  if (hoverRegistered) return;
  hoverRegistered = true;
  monaco.languages.registerHoverProvider(CEDAR_LANGUAGE_ID, {
    provideHover(
      model: monaco.editor.ITextModel,
      position: monaco.Position,
    ) {
      const word = model.getWordAtPosition(position);
      if (word === null) return null;
      const attribute = contextAttributesFor("tools/call").find(
        (entry) => entry.name === word.word,
      );
      if (attribute === undefined) return null;
      return {
        range: new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn,
        ),
        contents: [
          { value: `**context.${attribute.name}** \`${attribute.type}\`` },
          { value: attribute.documentation },
          { value: `Source: Team 4 / Team 3 fact \`${attribute.source}\`` },
        ],
      };
    },
  });
}

export interface RegisterCedarOptions {
  readonly tokens: DesignTokenMap;
  readonly mode: ThemeMode;
}

/** Register the language, theme, and providers exactly once. */
export function registerCedarLanguage(options: RegisterCedarOptions): void {
  configureEnvironment();

  if (!languageRegistered) {
    languageRegistered = true;
    monaco.languages.register({
      id: CEDAR_LANGUAGE_ID,
      extensions: [".cedar", ".cedarschema"],
      aliases: ["Cedar", "cedar"],
      mimetypes: ["text/x-cedar"],
    });
    monaco.languages.setMonarchTokensProvider(CEDAR_LANGUAGE_ID, monarchLanguage);
    monaco.languages.setLanguageConfiguration(
      CEDAR_LANGUAGE_ID,
      languageConfiguration,
    );
  }

  monaco.editor.defineTheme(
    CEDAR_DARK_THEME,
    createCedarMonacoTheme(options.tokens, "dark"),
  );
  monaco.editor.defineTheme(
    CEDAR_LIGHT_THEME,
    createCedarMonacoTheme(options.tokens, "light"),
  );

  registerCompletions();
  registerHover();
}

/** Apply backend/editor diagnostics to the model. */
export function setCedarMarkers(
  model: monaco.editor.ITextModel,
  diagnostics: readonly EditorDiagnostic[],
): void {
  monaco.editor.setModelMarkers(
    model,
    MARKER_OWNER,
    diagnostics.map((diagnostic) => ({
      severity:
        diagnostic.severity === "error"
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
      message: diagnostic.message,
      code: diagnostic.code,
      startLineNumber: Math.max(1, diagnostic.line),
      startColumn: Math.max(1, diagnostic.column),
      endLineNumber: Math.max(1, diagnostic.line),
      endColumn: Math.max(1, diagnostic.column + 1),
      source: diagnostic.code.startsWith("EDITOR") ? "Axiom editor" : "Axiom",
    })),
  );
}

export { monaco };
