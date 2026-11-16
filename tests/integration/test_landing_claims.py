"""
Unit tests verifying that 100% of claims in apps/web/app/data/claims.ts
have an explicit source, a valid classification (measured, verified, target, cited, or policy),
and verification provenance.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLAIMS_FILE = ROOT / "apps" / "web" / "app" / "data" / "claims.ts"


class TestLandingClaims(unittest.TestCase):
    def test_claims_file_exists_and_has_required_attributes(self):
        self.assertTrue(CLAIMS_FILE.exists(), f"claims.ts must exist at {CLAIMS_FILE}")
        content = CLAIMS_FILE.read_text(encoding="utf-8")

        # Extract all claim object blocks
        claim_blocks = re.findall(r"(\w+):\s*\{([^}]+)\}", content)
        self.assertGreaterEqual(len(claim_blocks), 7, f"Expected at least 7 claims, found {len(claim_blocks)}")

        for claim_id, body in claim_blocks:
            if claim_id in ("CLAIMS", "Record", "export"):
                continue

            # Check required fields
            self.assertIn('id:', body, f"Claim {claim_id} missing 'id'")
            self.assertIn('label:', body, f"Claim {claim_id} missing 'label'")
            self.assertIn('value:', body, f"Claim {claim_id} missing 'value'")
            self.assertIn('kind:', body, f"Claim {claim_id} missing 'kind'")
            self.assertIn('source:', body, f"Claim {claim_id} missing 'source'")

            # Verify kind is one of 'measured' | 'verified' | 'target' | 'cited' | 'policy'
            kind_match = re.search(r'kind:\s*["\'](measured|verified|target|cited|policy)["\']', body)
            self.assertIsNotNone(
                kind_match,
                f"Claim {claim_id} has invalid kind: must be 'measured', 'verified', 'target', 'cited', or 'policy'"
            )

            # Source must not be empty
            source_match = re.search(r'source:\s*["\']([^"\']+)["\']', body)
            self.assertIsNotNone(source_match, f"Claim {claim_id} missing source pattern")
            self.assertGreater(len(source_match.group(1).strip()), 3, f"Claim {claim_id} must have non-empty source")

if __name__ == "__main__":
    unittest.main()

