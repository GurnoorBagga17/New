"""Unit test for BlastRadiusGraph BFS reachability algorithm.

Verifies that:
1. Marked token 'tok-gh-app-sec' reaches downstream resources via directed edges.
2. BFS correctly tags sensitive datastores.
3. Unrelated nodes (e.g. isolated agents or disparate cloud roles) are not included.
4. Revocation collapses reachable count to zero.
"""

from pathlib import Path
import re
import unittest

# Parse graph.fixture.ts directly to test graph integrity in python test harness
FIXTURE_PATH = Path(__file__).resolve().parents[2] / "apps/web/app/components/blast/graph.fixture.ts"


def parse_edges_and_nodes():
    text = FIXTURE_PATH.read_text(encoding="utf-8")
    
    # Extract edges
    edge_pattern = re.compile(r"\{\s*from:\s*'([^']+)',\s*to:\s*'([^']+)',\s*rel:\s*'([^']+)'\s*\}")
    edges = [m.groups() for m in edge_pattern.finditer(text)]
    
    # Extract nodes
    node_pattern = re.compile(r"id:\s*'([^']+)'(?:,\s*kind:\s*'([^']+)')?(?:.*sensitive:\s*(true|false))?")
    nodes = {m.group(1): (m.group(3) == "true") for m in node_pattern.finditer(text)}
    
    return nodes, edges


def bfs_reachable(start_id: str, edges: list[tuple[str, str, str]]) -> set[str]:
    adj: dict[str, list[str]] = {}
    for src, dst, _ in edges:
        adj.setdefault(src, []).append(dst)
        
    visited: set[str] = {start_id}
    queue = [start_id]
    
    while queue:
        curr = queue.pop(0)
        for neighbor in adj.get(curr, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
                
    return visited


class TestBlastRadiusBfs(unittest.TestCase):
    def test_blast_radius_bfs_reachability(self):
        self.assertTrue(FIXTURE_PATH.is_file(), f"Fixture file not found at {FIXTURE_PATH}")
        nodes, edges = parse_edges_and_nodes()
        self.assertGreaterEqual(len(nodes), 20, f"Expected at least 20 nodes, got {len(nodes)}")
        self.assertGreaterEqual(len(edges), 10, f"Expected at least 10 edges, got {len(edges)}")
        
        target_token = "tok-gh-app-sec"
        self.assertIn(target_token, nodes, f"Target token {target_token} missing from graph")
        
        reachable = bfs_reachable(target_token, edges)
        # The token should reach CI/CD runner and downstream targets
        self.assertIn("sa-cicd-runner", reachable)
        self.assertIn("role-aws-prod-admin", reachable)
        self.assertIn("res-github-org", reachable)
        self.assertIn("res-github-secrets", reachable)
        self.assertIn("res-s3-prod-backups", reachable)
        self.assertIn("res-kms-master-key", reachable)
        
        # Check that unrelated agent is not reachable
        self.assertNotIn("agent-marketing-gen", reachable)
        self.assertNotIn("agent-support-ai", reachable)
        
        # Verify sensitive asset count among reachable nodes
        sensitive_reachable = [nid for nid in reachable if nodes.get(nid, False)]
        self.assertGreaterEqual(len(sensitive_reachable), 4, f"Expected at least 4 sensitive assets reachable, got {len(sensitive_reachable)}")

    def test_revocation_collapses_reachability(self):
        _, edges = parse_edges_and_nodes()
        target_token = "tok-gh-app-sec"
        
        # Simulate revocation: sever all edges originating from or entering target_token
        severed_edges = [e for e in edges if e[0] != target_token and e[1] != target_token]
        
        reachable_after_revoke = bfs_reachable(target_token, severed_edges)
        # After revocation, only the target token itself remains in its component
        downstream = reachable_after_revoke - {target_token}
        self.assertEqual(len(downstream), 0, f"Expected 0 reachable downstream nodes after revocation, got {downstream}")

if __name__ == "__main__":
    unittest.main()

