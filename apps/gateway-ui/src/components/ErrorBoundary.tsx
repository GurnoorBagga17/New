import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ViewErrorBoundaryProps {
  readonly viewName: string;
  readonly children: ReactNode;
}

interface ViewErrorBoundaryState {
  readonly hasError: boolean;
  readonly errorMessage: string | null;
}

/**
 * Isolates rendering faults inside critical Operator Console views (Live Traffic,
 * Cedar Policy Studio, Audit Explorer, Inspector Drawer, and Emergency Kill Switch)
 * so a single component error can never blank the console.
 */
export class ViewErrorBoundary extends Component<
  ViewErrorBoundaryProps,
  ViewErrorBoundaryState
> {
  override state: ViewErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: unknown): ViewErrorBoundaryState {
    return {
      hasError: true,
      errorMessage:
        error instanceof Error ? error.message : "Unexpected view rendering error",
    };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (typeof console !== "undefined") {
      console.error(
        `[Axiom ErrorBoundary] Fault isolated in ${this.props.viewName}:`,
        error,
        info.componentStack,
      );
    }
  }

  private readonly handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <section
          role="alert"
          aria-live="assertive"
          className="rounded-card border border-state-deny/50 bg-surface-1 p-6 text-text-primary"
        >
          <p className="font-mono text-xs uppercase tracking-wider text-state-deny">
            FAULT ISOLATED · {this.props.viewName}
          </p>
          <h2 className="mt-2 font-display text-lg font-semibold">
            {this.props.viewName} encountered a rendering error
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {this.state.errorMessage ?? "Unknown error"} — other console modules remain operational.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-4 rounded-input border border-border-strong bg-surface-2 px-3 py-2 font-mono text-xs font-semibold text-text-primary"
          >
            Recover {this.props.viewName} View
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
