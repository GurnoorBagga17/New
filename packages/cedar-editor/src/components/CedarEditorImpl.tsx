import { useEffect, useRef, useState } from "react";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { CedarEditorProps } from "./CedarEditor.js";
import {
  analyzeCedarText,
  type EditorDiagnostic,
} from "../schema/editor-diagnostics.js";
import {
  MissingDesignTokensError,
  readDesignTokensFromDocument,
} from "../theme/tokens.js";
import type { PolicyDiagnostic } from "../types.js";

function toMarkers(
  diagnostics: readonly PolicyDiagnostic[],
): readonly EditorDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnostic.message,
    line: diagnostic.line ?? 1,
    column: diagnostic.column ?? 1,
    severity: "error",
  }));
}

/**
 * Monaco mount. This module is the only place that imports Monaco, and it is
 * reached exclusively through the lazy boundary in `CedarEditor`.
 */
export default function CedarEditorImpl({
  value,
  onChange,
  diagnostics = [],
  themeMode = "light",
  heightPx = 416,
  readOnly = false,
  ariaLabel = "Cedar policy editor",
}: CedarEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<Monaco.editor.ITextModel | null>(null);
  const applyingExternalRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [fatal, setFatal] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return undefined;
    let disposed = false;
    let disposeEditor: (() => void) | null = null;

    const mount = async (): Promise<void> => {
      try {
        const setup = await import("../monaco/setup.js");
        const tokens = readDesignTokensFromDocument(document);
        setup.registerCedarLanguage({ tokens, mode: themeMode });
        if (disposed) return;

        const model = setup.monaco.editor.createModel(
          value,
          setup.CEDAR_LANGUAGE_ID,
          setup.monaco.Uri.parse(
            `inmemory://axiom/candidate-${Date.now()}-${Math.random().toString(16).slice(2)}.cedar`,
          ),
        );
        const editor = setup.monaco.editor.create(host, {
          model,
          theme:
            themeMode === "dark"
              ? setup.CEDAR_DARK_THEME
              : setup.CEDAR_LIGHT_THEME,
          readOnly,
          automaticLayout: true,
          ariaLabel,
          fontFamily: tokens["--font-mono"] ?? "monospace",
          fontSize: 12.5,
          lineHeight: 19,
          fontLigatures: false,
          minimap: { enabled: false },
          folding: false,
          glyphMargin: false,
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          renderLineHighlight: "all",
          padding: { top: 8, bottom: 8 },
          tabSize: 4,
          insertSpaces: true,
          wordWrap: "on",
          quickSuggestions: { other: true, comments: false, strings: false },
          suggestOnTriggerCharacters: true,
          fixedOverflowWidgets: true,
          overviewRulerBorder: false,
          scrollbar: { alwaysConsumeMouseWheel: false },
        });
        editorRef.current = editor;
        modelRef.current = model;
        const changeSubscription = editor.onDidChangeModelContent(() => {
          if (applyingExternalRef.current) return;
          onChangeRef.current(editor.getValue());
        });
        disposeEditor = () => {
          changeSubscription.dispose();
          editor.dispose();
          model.dispose();
          editorRef.current = null;
          modelRef.current = null;
        };
        const markers = [
          ...analyzeCedarText(editor.getValue()),
          ...toMarkers(diagnostics),
        ];
        setup.setCedarMarkers(model, markers);
        setReady(true);
      } catch (error) {
        if (disposed) return;
        setFatal(
          error instanceof MissingDesignTokensError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unknown Monaco initialisation failure.",
        );
      }
    };

    void mount();
    return () => {
      disposed = true;
      disposeEditor?.();
    };
    // The editor is intentionally created once per mount; props are synced by
    // the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null) return;
    if (editor.getValue() === value) return;
    applyingExternalRef.current = true;
    const position = editor.getPosition();
    editor.setValue(value);
    if (position !== null) editor.setPosition(position);
    applyingExternalRef.current = false;
  }, [value]);

  useEffect(() => {
    if (!ready) return;
    const model = modelRef.current;
    if (model === null) return;
    const markers = [
      ...analyzeCedarText(model.getValue()),
      ...toMarkers(diagnostics),
    ];
    void import("../monaco/setup.js").then((setup) => {
      if (model.isDisposed()) return;
      setup.setCedarMarkers(model, markers);
    });
  }, [diagnostics, ready]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null) return;
    editor.updateOptions({ readOnly });
  }, [readOnly]);

  if (fatal !== null) {
    return (
      <div className="ax-alert ax-alert--error" role="alert">
        <div>
          <strong>EDITOR UNAVAILABLE</strong>
          <p>{fatal}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="ax-editor-host"
      style={{ height: `${heightPx}px` }}
      data-testid="cedar-editor-host"
      ref={hostRef}
    />
  );
}
