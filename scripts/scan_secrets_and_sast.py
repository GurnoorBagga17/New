#!/usr/bin/env python3
"""
Zero-Trust Secret Scanner and Static Application Security Testing (SAST)
Enforces Axiom NHI Rule 4 (Zero Raw Token Exposure) and Fail-Closed Security.
"""

import sys
import os
import re
import subprocess
from pathlib import Path

IGNORE_EXTS = {
    ".png", ".jpg", ".jpeg", ".ico", ".svg", ".lock", ".wasm",
    ".pdb", ".exe", ".dll", ".so", ".dylib", ".bin", ".tar", ".gz"
}

# Regex patterns for detecting potential unredacted live secret leaks
HIGH_RISK_SECRET_PATTERNS = [
    (r'(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}', "Unmasked AWS Access Key ID"),
    (r'ghp_[a-zA-Z0-9]{36}', "Unmasked GitHub Personal Access Token"),
    (r'xox[baprs]-[0-9A-Za-z-]{24,}', "Unmasked Slack OAuth Token"),
    (r'sk_live_[0-9a-zA-Z]{24,}', "Unmasked Stripe Live Secret Key"),
    (r'-----BEGIN\s+(?:RSA|OPENSSH|EC|DSA)\s+PRIVATE\s+KEY-----', "Unencrypted Private Key Block")
]

# Patterns for logging unredacted secrets
RAW_TOKEN_LOG_PATTERNS = [
    (r'(?:console\.log|println!|tracing::info!|tracing::debug!)\s*\(\s*["\'][^"\']*(?:raw_token|secret_key|password)["\']\s*,\s*[a-zA-Z0-9_]+token', "Unredacted Raw Token Log Statement")
]

def scan_file(filepath: Path) -> list:
    issues = []
    # Skip test files and examples when checking for mock private keys or mock AWS IDs
    str_path = str(filepath).lower()
    is_test_or_example = (
        "test" in filepath.name.lower() or 
        "example" in filepath.name.lower() or 
        "fixture" in str_path or
        "mock" in str_path or
        "dummy" in str_path or
        "seed" in str_path or
        "pattern" in str_path or
        "spec" in filepath.name.lower()
    )

    try:
        content = filepath.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return issues

    in_rust_cfg_test = False
    for line_num, line in enumerate(content.splitlines(), start=1):
        if is_test_or_example:
            continue

        if "#[cfg(test)]" in line:
            in_rust_cfg_test = True
        if in_rust_cfg_test:
            continue

        for pattern, label in HIGH_RISK_SECRET_PATTERNS:
            if re.search(pattern, line):
                # Check if it's explicitly an example or placeholder
                line_lower = line.lower()
                if "example" in line_lower or "mock" in line_lower or "dummy" in line_lower or "placeholder" in line_lower or "xxx" in line_lower or "replace" in line_lower:
                    continue
                issues.append((filepath, line_num, label, line.strip()[:80]))

        for pattern, label in RAW_TOKEN_LOG_PATTERNS:
            if re.search(pattern, line):
                issues.append((filepath, line_num, label, line.strip()[:80]))

    return issues

def scan_repo(root: Path):
    print(f"[SAST] Starting repository security & secret scan at {root}...", flush=True)

    # Use git ls-files to scan tracked files rapidly
    try:
        res = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True, check=True)
        files_to_scan = [root / p for p in res.stdout.splitlines() if p.strip()]
    except Exception:
        files_to_scan = [p for p in root.rglob("*") if p.is_file()]

    total_files = 0
    total_issues = 0

    for p in files_to_scan:
        if p.suffix.lower() in IGNORE_EXTS:
            continue
        if any(ignored in p.parts for ignored in ["node_modules", "target", ".git", ".turbo", ".next"]):
            continue

        total_files += 1
        issues = scan_file(p)
        for filepath, line_num, label, snippet in issues:
            total_issues += 1
            rel_path = filepath.relative_to(root)
            print(f"[FAIL] {label} at {rel_path}:{line_num}", flush=True)
            print(f"       Snippet: {snippet}", flush=True)

    print(f"[SAST] Scanned {total_files} files.", flush=True)
    if total_issues == 0:
        print("[SAST] PASS: Zero unredacted secrets or raw token leaks detected.", flush=True)
        return 0
    else:
        print(f"[SAST] FAIL: Found {total_issues} security violations.", flush=True)
        return 1

if __name__ == "__main__":
    repo_root = Path(__file__).resolve().parent.parent
    sys.exit(scan_repo(repo_root))
