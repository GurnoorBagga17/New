#!/usr/bin/env python3
"""Require frontend source colors to come from tokens.json and verify WCAG 2.1 AA contrast."""

import json
import re
import sys
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TOKENS = ROOT / "tokens.json"
SOURCES = ("apps/gateway-ui", "apps/web", "packages/ui", "packages/cedar-editor")
EXTENSIONS = {".css", ".scss", ".html", ".js", ".jsx", ".ts", ".tsx", ".svg"}
# Matches hex colors but excludes HTML entities (e.g. &#8838;), SVG fragments, and URLs
HEX = re.compile(r"(?<![\w&#\-])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])")
BLACK = re.compile(r"(?<![\w&#\-])#(?:000|0000|000000|00000000)(?![0-9a-fA-F])", re.IGNORECASE)

# Files in apps/web currently pending Phase 1/2 token migration
LEGACY_MIGRATION_PENDING = {
    Path("apps/web/app/page.tsx"),
    Path("apps/web/app/components"),
    Path("apps/web/app/playground"),
    Path("apps/web/app/sign-in"),
    Path("apps/web/app/sign-up"),
}

TEXT_ROLES = ("text-primary", "text-secondary", "text-muted")
SURFACES = ("bg-canvas", "bg-surface-1", "bg-surface-2", "bg-surface-3")


def luminance(value: str) -> float:
    if not value.startswith("#") or len(value) != 7:
        raise ValueError(f"expected opaque #RRGGBB color, got {value!r}")
    channels = [int(value[index : index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return sum(channel * weight for channel, weight in zip(linear, (0.2126, 0.7152, 0.0722)))


def contrast(foreground: str, background: str) -> float:
    high, low = sorted((luminance(foreground), luminance(background)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def check_contrast_rules() -> list[str]:
    if not TOKENS.is_file():
        return [f"tokens.json not found at {TOKENS}"]
    try:
        document = json.loads(TOKENS.read_text(encoding="utf-8"))
    except Exception as exc:
        return [f"failed to read tokens.json: {exc}"]

    failures: list[str] = []
    for theme_name in ("dark", "light"):
        colors = document.get(theme_name, {}).get("color", {})
        for text_role in TEXT_ROLES:
            for surface in SURFACES:
                fg_key = f"{text_role}-{theme_name}"
                bg_key = f"{surface}-{theme_name}"
                if fg_key not in colors or bg_key not in colors:
                    failures.append(f"Missing token key {fg_key} or {bg_key} in {theme_name}")
                    continue
                ratio = contrast(colors[fg_key]["$value"], colors[bg_key]["$value"])
                if ratio < 4.5:
                    failures.append(f"{theme_name}.{text_role} on {surface}: {ratio:.2f}:1 (requires >= 4.5:1)")

        for surface in SURFACES:
            border_key = f"border-strong-{theme_name}"
            bg_key = f"{surface}-{theme_name}"
            if border_key not in colors or bg_key not in colors:
                failures.append(f"Missing token key {border_key} or {bg_key} in {theme_name}")
                continue
            ratio = contrast(colors[border_key]["$value"], colors[bg_key]["$value"])
            if ratio < 3.0:
                failures.append(f"{theme_name}.border-strong on {surface}: {ratio:.2f}:1 (requires >= 3.0:1)")

    return failures


def is_legacy_unmigrated(file_path: Path) -> bool:
    rel = file_path.relative_to(ROOT)
    for pending in LEGACY_MIGRATION_PENDING:
        if rel == pending or pending in rel.parents:
            return True
    return False


def main() -> int:
    # 1. Verify WCAG 2.1 AA token contrast rules (must strictly maintain 4.5:1 / 3.0:1)
    contrast_failures = check_contrast_rules()
    if contrast_failures:
        print("FAIL frontend color gate: token contrast rule failure:")
        for failure in contrast_failures:
            print(f"  - {failure}")
        return 1

    # Phase 1 completion gate: fail if any unmigrated files remain when STRICT_PHASE1 is set
    if os.environ.get("STRICT_PHASE1") == "1" and LEGACY_MIGRATION_PENDING:
        print("FAIL frontend color gate: STRICT_PHASE1 enabled but exemptions remain:")
        for pending in sorted(str(p) for p in LEGACY_MIGRATION_PENDING):
            print(f"  - {pending}")
        return 1

    # 2. Verify source code token compliance (no hardcoded hex or pure black)
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
                if is_legacy_unmigrated(file):
                    continue
                scanned_files += 1
                text = file.read_text(encoding="utf-8", errors="replace")
                for line_number, line in enumerate(text.splitlines(), 1):
                    # Ignore pure SVG clip-path/filter URL references like url(#gradient)
                    stripped = re.sub(r'url\(#[^)]+\)', '', line)
                    if BLACK.search(stripped):
                        findings.append(f"{file.relative_to(ROOT)}:{line_number}: pure black is forbidden")
                    elif HEX.search(stripped):
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

    print(f"PASS frontend color gate: WCAG 2.1 AA contrast verified; scanned {scanned_files} source files; zero hardcoded colors or pure black")
    return 0


if __name__ == "__main__":
    sys.exit(main())
