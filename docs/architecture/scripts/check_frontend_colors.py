#!/usr/bin/env python3
"""Require frontend source colors to come from tokens.json."""

import re
import sys
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SOURCES = ("apps/gateway-ui", "apps/web", "packages/ui", "packages/cedar-editor")
EXTENSIONS = {".css", ".scss", ".html", ".js", ".jsx", ".ts", ".tsx", ".svg"}
HEX = re.compile(r"(?<![\w-])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])")
BLACK = re.compile(r"#(?:000|0000|000000|00000000)(?![0-9a-fA-F])", re.IGNORECASE)


def main() -> int:
    missing = [path for path in SOURCES if not (ROOT / path).is_dir()]
    findings = []
    scanned_files = 0
    for source in SOURCES:
        directory = ROOT / source
        if not directory.is_dir():
            continue
        for current, directories, filenames in os.walk(directory):
            directories[:] = [
                name
                for name in directories
                if name not in {"node_modules", "dist", ".next", ".git", "storybook-static"}
            ]
            for filename in filenames:
                file = Path(current) / filename
                if file.suffix.lower() not in EXTENSIONS:
                    continue
                scanned_files += 1
                text = file.read_text(encoding="utf-8", errors="replace")
                for line_number, line in enumerate(text.splitlines(), 1):
                    if BLACK.search(line):
                        findings.append(f"{file.relative_to(ROOT)}:{line_number}: pure black is forbidden")
                    elif HEX.search(line):
                        findings.append(f"{file.relative_to(ROOT)}:{line_number}: hardcoded color must use a design token")
    if missing:
        print("FAIL frontend color gate: missing owned frontend source directories:")
        for path in missing:
            print(f"  {path}")
    if findings:
        print("FAIL frontend color gate:")
        print("\n".join(f"  {finding}" for finding in findings))
    if scanned_files == 0:
        print("FAIL frontend color gate: no frontend source files found to scan")
    if missing or findings or scanned_files == 0:
        return 1
    print(f"PASS frontend color gate: scanned {scanned_files} source files; no hardcoded hex colors or pure black")
    return 0


if __name__ == "__main__":
    sys.exit(main())
