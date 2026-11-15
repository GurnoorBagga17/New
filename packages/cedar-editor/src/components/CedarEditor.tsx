import {
  Component,
  Suspense,
  lazy,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type { PolicyDiagnostic } from "../types.js";
import type { ThemeMode } from "../theme/tokens.js";

const LazyCedarEditorImpl = lazy(() => import("./CedarEditorImpl.js"));

export interface CedarEditorProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** Backend/WASM diagnostics rendered as Monaco markers. */
  readonly diagnostics?: readonly PolicyDiagnostic[];
  readonly themeMode?: ThemeMode;
  /** `manual` is used by the loading-state story and by tests. */
  readonly loadStrategy?: "on-mount" | "manual";
  /** Editor height in CSS pixels. */
  readonly heightPx?: number;
  readonly readOnly?: boolean;
  readonly ariaLabel?: string;
}

/**
 * Lazy Monaco wrapper.
 *
 * `monaco-editor` and its worker are imported only by `CedarEditorImpl`, which
 * is a dynamic import. The initial application chunk therefore contains no
 * Monaco code and no worker URL.
 */
export function CedarEditor({
  value,
  onChange,
  diagnostics = [],
  themeMode = "light",
  loadStrategy = "on-mount",
  heightPx = 416,
  readOnly = false,
  ariaLabel = "Cedar policy editor",
}: CedarEditorProps) {
  const [manualLoaded, setManualLoaded] = useState(false);
  const [generation, setGeneration] = useState(0);
  const shouldLoad = loadStrategy === "on-mount" || manualLoaded;

  if (!shouldLoad) {
    return (
      <div className="ax-editor-host" style={{ height: `${heightPx}px` }}>
        <div className="ax-editor-skeleton" role="status" aria-live="polite">
          <span>Cedar editor is not loaded yet.</span>
          <span>Monaco and its worker are loaded from the local bundle only.</span>
          <button
            type="button"
            className="ax-btn ax-btn--ghost"
            onClick={() => setManualLoaded(true)}
            style={{ alignSelf: "flex-start" }}
          >
            Load Cedar Editor
          </button>
        </div>
      </div>
    );
  }

  return (
    <EditorBoundary
      key={generation}
      onRetry={() => setGeneration((current) => current + 1)}
    >
      <Suspense fallback={<EditorLoading heightPx={heightPx} />}>
        <LazyCedarEditorImpl
          value={value}
          onChange={onChange}
          diagnostics={diagnostics}
          themeMode={themeMode}
          heightPx={heightPx}
          readOnly={readOnly}
          ariaLabel={ariaLabel}
        />
      </Suspense>
    </EditorBoundary>
  );
}

function EditorLoading({ heightPx }: { readonly heightPx: number }) {
  return (
    <div className="ax-editor-host" style={{ height: `${heightPx}px` }}>
      <div className="ax-editor-skeleton" role="status" aria-live="polite">
        <span style={{ width: "100%" }} className="ax-loading-bar" />
        <span>LOADING CEDAR EDITOR — Monaco is a local lazy chunk.</span>
        <span>No CDN loader and no remote worker URL are used.</span>
      </div>
    </div>
  );
}

interface BoundaryProps {
  readonly children: ReactNode;
  readonly onRetry: () => void;
}

interface BoundaryState {
  readonly message: string | null;
}

class EditorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return {
      message:
        error instanceof Error ? error.message : "Unknown Monaco load failure.",
    };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Local-only diagnostics: never log policy text or envelope arguments.
    if (typeof console !== "undefined") {
      console.error("Cedar editor failed to load", error, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (this.state.message !== null) {
      return (
        <div className="ax-alert ax-alert--error" role="alert">
          <div>
            <strong>EDITOR UNAVAILABLE</strong>
            <p>
              Monaco failed to load from the local bundle: {this.state.message}.
              No CDN fallback is attempted.
            </p>
            <button
              type="button"
              className="ax-btn ax-btn--ghost"
              onClick={() => {
                this.setState({ message: null });
                this.props.onRetry();
              }}
              style={{ marginTop: "0.5rem" }}
            >
              Retry Local Load
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
