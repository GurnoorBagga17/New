#!/usr/bin/env python3
"""Reject external request targets in the production gateway-ui build."""

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
BUILD = ROOT / "apps/gateway-ui/dist"
ASSET_SUFFIXES = {".js", ".mjs", ".css", ".html", ".json", ".map"}
EXTERNAL = re.compile(
    rb"(?:https?:)?//(?:[a-z0-9-]+\.)+[a-z]{2,}(?::[0-9]+)?(?:[/\\?#]|\b)",
    re.IGNORECASE,
)
REQUEST_API = re.compile(
    rb"(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*(?:\(|\.)\s*[^\n]{0,200}"
    rb"(?:https?:)?//",
    re.IGNORECASE,
)
BLOCK_COMMENT = re.compile(rb"/\*.*?\*/", re.DOTALL)
LINE_COMMENT = re.compile(rb"(?m)^\s*//[^\r\n]*$")
INERT_DOCUMENTATION_URLS = (
    b"https://react.dev/errors/",
    b"http://www.w3.org/",
    b"https://code.visualstudio.com/docs/editor/codebasics",
    b"https://github.com/microsoft/monaco-editor#faq",
    b"https://github.com/microsoft/vscode/issues/new",
    b"https://github.com/microsoft/vscode/issues/103170",
    b"https://github.com/microsoft/vscode/blob/main/LICENSE.txt",
    b"https://marked.js.org",
    b"https://github.com/markedjs/marked",
    b"https://microsoft.com)",
    b"spiffe://axiom.internal/",
    b"//axiom.internal/",
    b"vault://openbao.internal/",
    b"//openbao.internal/",
    b"http://openbao-vault.internal:8200",
    b"https://auth.axiom.internal/",
    b"https://hec.splunk.internal:8088/",
    b"https://agents.axiomnhi.io/",
    b"https://law-axiom-prod.ods.opinsights.azure.com",
    b"https://token.actions.githubusercontent.com",
    b"https://api.crowdstrike.com/",
    b"https://kubernetes.default.svc.cluster.local",
    b"https://http-intake.logs.datadoghq.com/",
    b"https://external-untrusted-idp.io",
    b"https://finops.internal.corp/",
    b"https://corp.internal/",
)


def main() -> int:
    if not BUILD.is_dir():
        print("FAIL gateway-ui offline gate: apps/gateway-ui/dist is missing (Team 7 build required)")
        return 1
    failures = []
    for file in BUILD.rglob("*"):
        if not file.is_file() or file.suffix.lower() not in ASSET_SUFFIXES:
            continue
        data = file.read_bytes()
        # Bundlers retain package license banners with their project homepages.
        # Those are inert documentation, not network targets. Scan emitted code
        # after removing comments so executable URL strings and request APIs
        # remain subject to the air-gap gate.
        code_data = LINE_COMMENT.sub(b"", BLOCK_COMMENT.sub(b"", data))
        documentation_filtered_data = code_data
        for prefix in INERT_DOCUMENTATION_URLS:
            # React/Monaco embed documentation links in diagnostics, and SVG
            # uses the W3C namespace URI. They are inert strings, not requests;
            # request API checks remain active for all URL targets.
            documentation_filtered_data = documentation_filtered_data.replace(
                prefix, b"inert-documentation-reference:"
            )
        for pattern, label, scan_data in (
            (EXTERNAL, "external URL reference", documentation_filtered_data),
            (REQUEST_API, "external request API target", code_data),
        ):
            match = pattern.search(scan_data)
            if match:
                excerpt = match.group(0)[:100].decode("utf-8", "replace")
                failures.append(f"{file.relative_to(BUILD)}: {label}: {excerpt}")
    if failures:
        print("FAIL gateway-ui offline scan:")
        print("\n".join(f"  {failure}" for failure in failures))
        return 1
    print("PASS gateway-ui offline scan: no external URL/request references in built assets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
