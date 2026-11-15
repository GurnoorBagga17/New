"""
Standard-library offline pytest compatibility shim for Axiom NHI.
Allows `python3 tests/run_tests.py` to execute all test modules, classes,
functions, `@pytest.fixture` injections, and `@pytest.mark.skipif` guards
without requiring external package installation in air-gapped environments.
"""

from __future__ import annotations

import importlib.util
import inspect
import os
import sys
import traceback
from pathlib import Path


class SkipTestException(Exception):
    pass


def fixture(func=None, **_kwargs):
    if func is None:
        def wrapper(f):
            f._is_pytest_fixture = True
            return f
        return wrapper
    func._is_pytest_fixture = True
    return func


class _Mark:
    @staticmethod
    def skipif(condition: bool, reason: str = ""):
        def decorator(func):
            if condition:
                func._pytest_skip_reason = reason or "skipped by condition"
            return func
        return decorator

    @staticmethod
    def parametrize(argnames, argvalues):
        def decorator(func):
            func._pytest_parametrize = (argnames, argvalues)
            return func
        return decorator


mark = _Mark()


def skip(reason: str = "") -> None:
    raise SkipTestException(reason)


class _RaisesContext:
    def __init__(self, expected_exc):
        self.expected_exc = expected_exc
        self.value = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, _tb):
        if exc_type is None:
            raise AssertionError(f"Expected {self.expected_exc} to be raised, but no exception was raised")
        if issubclass(exc_type, self.expected_exc):
            self.value = exc_val
            return True
        return False


def raises(expected_exc):
    return _RaisesContext(expected_exc)


class _CapSys:
    class _Disabled:
        def __enter__(self): return self
        def __exit__(self, *args): return False
    def disabled(self):
        return self._Disabled()

def _collect_fixtures(module) -> dict:
    fixtures = {"capsys": lambda: _CapSys()}
    for name, obj in inspect.getmembers(module):
        if callable(obj) and getattr(obj, "_is_pytest_fixture", False):
            fixtures[name] = obj
    return fixtures


def _invoke_with_fixtures(func, fixtures: dict, bound_self=None):
    sig = inspect.signature(func)
    kwargs = {}
    for param_name in sig.parameters:
        if param_name == "self":
            continue
        if param_name in fixtures:
            kwargs[param_name] = fixtures[param_name]()
    if bound_self is not None:
        return func(bound_self, **kwargs)
    return func(**kwargs)


def main(args=None) -> int:
    args = args or ["tests"]
    root = Path.cwd()
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    test_files = []
    for target in args:
        if target.startswith("-"):
            continue
        p = (root / target).resolve()
        if p.is_file() and p.name.startswith("test_") and p.suffix == ".py":
            test_files.append(p)
        elif p.is_dir():
            for dirpath, _, filenames in os.walk(p):
                for fn in sorted(filenames):
                    if fn.startswith("test_") and fn.endswith(".py"):
                        test_files.append(Path(dirpath) / fn)

    passed = 0
    failed = 0
    skipped = 0

    print("================================================================")
    print("AXIOM NHI PYTHON VERIFICATION SUITE (PHASES 1-4)")
    print("================================================================")

    for idx, tf in enumerate(sorted(set(test_files))):
        rel = tf.relative_to(root)
        mod_name = f"_axiom_test_mod_{idx}_{tf.stem}"
        spec = importlib.util.spec_from_file_location(mod_name, tf)
        module = importlib.util.module_from_spec(spec)
        sys.modules[mod_name] = module
        spec.loader.exec_module(module)

        fixtures = _collect_fixtures(module)

        # Standalone test_* functions
        for name, obj in inspect.getmembers(module, inspect.isfunction):
            if not name.startswith("test_"):
                continue
            if hasattr(obj, "_pytest_skip_reason"):
                skipped += 1
                print(f"  [SKIP] {rel}::{name} ({obj._pytest_skip_reason})")
                continue
            try:
                _invoke_with_fixtures(obj, fixtures)
                passed += 1
                print(f"  [PASS] {rel}::{name}")
            except SkipTestException as se:
                skipped += 1
                print(f"  [SKIP] {rel}::{name} ({se})")
            except Exception as exc:
                failed += 1
                print(f"  [FAIL] {rel}::{name}: {exc}")
                traceback.print_exc()

        # Test* classes
        for cls_name, cls_obj in inspect.getmembers(module, inspect.isclass):
            if not cls_name.startswith("Test"):
                continue
            for m_name, m_obj in inspect.getmembers(cls_obj, inspect.isfunction):
                if not m_name.startswith("test_"):
                    continue
                if hasattr(m_obj, "_pytest_skip_reason"):
                    skipped += 1
                    print(f"  [SKIP] {rel}::{cls_name}::{m_name} ({m_obj._pytest_skip_reason})")
                    continue
                instance = cls_obj()
                try:
                    _invoke_with_fixtures(m_obj, fixtures, bound_self=instance)
                    passed += 1
                    print(f"  [PASS] {rel}::{cls_name}::{m_name}")
                except SkipTestException as se:
                    skipped += 1
                    print(f"  [SKIP] {rel}::{cls_name}::{m_name} ({se})")
                except Exception as exc:
                    failed += 1
                    print(f"  [FAIL] {rel}::{cls_name}::{m_name}: {exc}")
                    traceback.print_exc()

    print("----------------------------------------------------------------")
    print(f"SUMMARY: {passed} passed, {skipped} skipped, {failed} failed")
    print("================================================================")
    return 1 if failed > 0 else 0
