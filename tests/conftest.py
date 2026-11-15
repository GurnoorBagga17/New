"""
tests/conftest.py
Team 6 — Gate G1 Acceptance Harness
Root conftest for all test suites under /tests/.

Adds the Desktop/Axiom root to sys.path so that
  `from tests.integration.helpers.assertions import ...`
works without installation.
"""

import sys
import os

# Allow imports relative to the Axiom repo root
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)
