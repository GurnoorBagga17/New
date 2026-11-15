"""Run the Axiom Python verification suite through pytest (or offline stdlib shim)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(pytest.main(["tests", *sys.argv[1:]]))
