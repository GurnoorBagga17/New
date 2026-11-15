import { useMemo } from "react";
import { diffLines } from "../forms/diff.js";

export interface PolicyDiffProps {
  readonly before: string;
  readonly after: string;
  readonly beforeLabel?: string;
  readonly afterLabel?: string;
}

/** Textual diff shown before activation. Not a semantic policy diff. */
export function PolicyDiff({
  before,
  after,
  beforeLabel = "CURRENT CANDIDATE (session baseline)",
  afterLabel = "CANDIDATE TO ACTIVATE",
}: PolicyDiffProps) {
  const diff = useMemo(() => diffLines(before, after), [before, after]);
  const changed = diff.added > 0 || diff.removed > 0;

  return (
    <section aria-labelledby="ax-diff-title">
      <div className="ax-row">
        <p className="ax-overline" id="ax-diff-title" style={{ margin: 0 }}>
          Policy diff — textual review
        </p>
        <span className="ax-mono ax-muted">
          +{diff.added} / −{diff.removed}
        </span>
      </div>
      <p className="ax-secondary" style={{ margin: "0.25rem 0 0.5rem", fontSize: "0.75rem" }}>
        {beforeLabel} → {afterLabel}
      </p>
      {changed ? (
        <div className="ax-diff" aria-label="Line diff before and after activation">
          {diff.lines.map((line) => (
            <div
              key={`${line.kind}-${line.oldLine ?? "n"}-${line.newLine ?? "n"}`}
              className={`ax-diff__line ax-diff__line--${line.kind}`}
            >
              <span className="ax-diff__num">{line.oldLine ?? ""}</span>
              <span className="ax-diff__num">{line.newLine ?? ""}</span>
              <span>
                <span className="ax-diff__sign">
                  {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
                </span>{" "}
                {line.text}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="ax-secondary" style={{ margin: 0 }}>
          No textual changes from the session baseline.
        </p>
      )}
      {diff.truncated ? (
        <p className="ax-field-error" role="status">
          Diff truncated at 800 lines; review the full policy in the editor.
        </p>
      ) : null}
    </section>
  );
}
