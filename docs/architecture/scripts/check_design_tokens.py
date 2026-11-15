#!/usr/bin/env python3
"""Check required WCAG 2.1 AA text and interactive-border token pairs."""

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TOKENS = ROOT / "tokens.json"
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


def main() -> int:
    document = json.loads(TOKENS.read_text(encoding="utf-8"))
    failures: list[str] = []
    rows: list[tuple[str, str, str, float]] = []
    for theme_name in ("dark", "light"):
        colors = document[theme_name]["color"]
        for text_role in TEXT_ROLES:
            for surface in SURFACES:
                value = contrast(colors[f"{text_role}-{theme_name}"]["$value"], colors[f"{surface}-{theme_name}"]["$value"])
                rows.append((theme_name, text_role, surface, value))
                if value < 4.5:
                    failures.append(
                        f"{theme_name}.{text_role} on {surface}: {value:.2f}:1 (needs 4.5:1)"
                    )
        for surface in SURFACES:
            value = contrast(colors[f"border-strong-{theme_name}"]["$value"], colors[f"{surface}-{theme_name}"]["$value"])
            rows.append((theme_name, "border-strong", surface, value))
            if value < 3.0:
                failures.append(
                    f"{theme_name}.border-strong on {surface}: {value:.2f}:1 (needs 3:1)"
                )

    print("Axiom token contrast check (WCAG 2.1 AA)")
    for theme, role, surface, value in rows:
        print(f"  {theme:5} {role:18} on {surface:14} {value:5.2f}:1")
    if failures:
        print("FAIL")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print(f"PASS: {len(rows)} text/border pairs meet the configured thresholds")
    return 0


if __name__ == "__main__":
    sys.exit(main())
