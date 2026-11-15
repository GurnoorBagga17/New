#!/usr/bin/env python3
"""Fail with actionable missing inputs until the planned TS workspaces exist."""

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
REQUIRED = (
    Path("pnpm-workspace.yaml"),
    Path("pnpm-lock.yaml"),
    Path("apps/gateway-ui/package.json"),
    Path("apps/web/package.json"),
    Path("packages/ui/package.json"),
    Path("packages/cedar-editor/package.json"),
)


def main() -> int:
    missing = [path.as_posix() for path in REQUIRED if not (ROOT / path).is_file()]
    missing_types: list[str] = []
    for relative in REQUIRED[2:]:
        manifest = ROOT / relative
        if not manifest.is_file():
            continue
        package = json.loads(manifest.read_text(encoding="utf-8"))
        if not package.get("scripts", {}).get("typecheck"):
            missing_types.append(f"{relative.as_posix()} (scripts.typecheck)")
    if missing or missing_types:
        print("Frontend workspace gate: FAIL — required Team 7/8 inputs are not delivered.")
        for path in missing:
            print(f"  missing: {path}")
        for path in missing_types:
            print(f"  missing: {path}")
        return 1
    print("Frontend workspace gate: PASS — workspace and typecheck scripts exist.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
