#!/usr/bin/env python3
"""Check gzip size of statically imported JavaScript entry graphs."""

import gzip
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
LIMITS = (("apps/web", 180 * 1024), ("apps/gateway-ui", 450 * 1024))


def vite_entry_files(app: Path) -> list[Path] | None:
    manifest = app / "dist/.vite/manifest.json"
    if not manifest.exists():
        manifest = app / "dist/manifest.json"
    if not manifest.exists():
        return None
    entries = json.loads(manifest.read_text(encoding="utf-8"))
    by_file = {item["file"]: item for item in entries.values()}
    roots = [item for item in entries.values() if item.get("isEntry")]
    files: set[str] = set()

    def add(entry: dict) -> None:
        file = entry.get("file")
        if file and file.endswith(".js"):
            files.add(file)
        for imported in entry.get("imports", []):
            child = by_file.get(imported)
            if child:
                add(child)
        # dynamicImports are intentionally excluded from the initial bundle.

    for root in roots:
        add(root)
    return [app / "dist" / file for file in sorted(files)]


def next_entry_files(app: Path) -> list[Path] | None:
    build = app / ".next"
    manifest_path = build / "app-build-manifest.json"
    if not manifest_path.exists():
        manifest_path = build / "build-manifest.json"
    if not manifest_path.exists():
        return None
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    candidates = manifest.get("pages", {}).get("/", [])
    candidates += manifest.get("rootMainFiles", [])
    if not candidates:
        candidates = manifest.get("rootMainFiles", [])
    files = {build / file for file in candidates if file.endswith(".js")}
    return sorted(files)


def main() -> int:
    failures = 0
    for app_name, limit in LIMITS:
        app = ROOT / app_name
        files = vite_entry_files(app) if (app / "dist").exists() else None
        if files is None:
            files = next_entry_files(app)
        if not files:
            print(f"FAIL {app_name}: no supported build manifest/initial entry graph found")
            failures += 1
            continue
        missing = [file for file in files if not file.is_file()]
        if missing:
            print(f"FAIL {app_name}: manifest references missing initial JavaScript files")
            failures += 1
            continue
        size = sum(len(gzip.compress(file.read_bytes(), compresslevel=9, mtime=0)) for file in files)
        status = "PASS" if size < limit else "FAIL"
        print(f"{status} {app_name}: {size / 1024:.1f} KiB gzip / {limit / 1024:.0f} KiB budget")
        if size >= limit:
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
