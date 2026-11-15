"""Run the Axiom Python verification suite through pytest."""

from __future__ import annotations

import sys

try:
    import pytest
except ImportError as exc:  # pragma: no cover - environment setup guidance
    raise SystemExit("pytest is required; install the project test dependencies with `pip install -r requirements-dev.txt`") from exc


if __name__ == "__main__":
    raise SystemExit(pytest.main(["tests", *sys.argv[1:]]))
