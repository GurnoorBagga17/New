import { Component, type ErrorInfo, type ReactNode } from "react";

interface ViewErrorBoundaryProps {
  readonly viewName: string;
  readonly children: ReactNode;
}

interface ViewErrorBoundaryState {
  readonly hasError: boolean;
}

/** Keeps a rendering failure in one console view from blanking the whole console. */
export class ViewErrorBoundary extends Component<
  ViewErrorBoundaryProps,
  ViewErrorBoundaryState
> {
  override state: ViewErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ViewErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof console !== "undefined") {
      console.error(
        `[Axiom] Rendering failed in ${this.props.viewName}`,
        error,
        info.componentStack,
      );
    }
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <section
        role="alert"
        aria-live="assertive"
        className="rounded-card border border-state-deny/50 bg-surface-1 p-6 text-text-primary"
      >
        <p className="font-mono text-xs uppercase tracking-wider text-state-deny">
          VIEW ERROR · {this.props.viewName}
        </p>
        <h2 className="mt-2 font-display text-lg font-semibold">
          This view could not be displayed.
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Other console sections remain available. Switch away and return to retry this view.
        </p>
      </section>
    );
  }
}
