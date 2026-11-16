-- Axiom NHI Phase 2 — Postgres 16 Identity Inventory & Dependency Lineage Graph DDL
-- Strictly stores HMAC-SHA256 credential fingerprints (never plaintext secret values).

CREATE TABLE IF NOT EXISTS nhi_nodes (
    entity_uid TEXT PRIMARY KEY,
    entity_kind TEXT NOT NULL,
    source_connector TEXT NOT NULL,
    display_name TEXT NOT NULL,
    fingerprint_sha256 TEXT NOT NULL,
    owner_email TEXT,
    owning_team TEXT,
    owner_confidence REAL DEFAULT 0.0,
    exposure_score SMALLINT DEFAULT 0,
    blast_radius_score SMALLINT DEFAULT 0,
    owasp_nhi_flags TEXT[] DEFAULT '{}',
    owasp_mcp_flags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nhi_edges (
    source_uid TEXT NOT NULL REFERENCES nhi_nodes(entity_uid) ON DELETE CASCADE,
    target_uid TEXT NOT NULL REFERENCES nhi_nodes(entity_uid) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    observed_via TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    call_count_24h BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (source_uid, target_uid, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_nhi_edges_target ON nhi_edges(target_uid);
CREATE INDEX IF NOT EXISTS idx_nhi_nodes_unowned ON nhi_nodes(owner_email) WHERE owner_email IS NULL;

-- Recursive CTE Pre-Revocation Blast-Radius & Sibling Simulator
CREATE OR REPLACE VIEW v_shared_credential_siblings AS
SELECT
    e1.target_uid AS credential_uid,
    e1.source_uid AS workload_uid,
    e2.source_uid AS sibling_workload_uid
FROM nhi_edges e1
JOIN nhi_edges e2
  ON e1.target_uid = e2.target_uid
 AND e1.source_uid <> e2.source_uid
WHERE e1.relation_type IN ('authenticates_with', 'reads_secret');

-- Recursive CTE Function: Simulates full blast radius of revoking an entity
CREATE OR REPLACE FUNCTION simulate_revocation(p_target_uid TEXT)
RETURNS TABLE (
    node_uid TEXT,
    entity_kind TEXT,
    display_name TEXT,
    distance INT,
    impact_type TEXT,
    relation_path TEXT[]
) LANGUAGE sql STABLE AS $$
WITH RECURSIVE dependency_chain AS (
    -- Base case: direct dependents of the target entity
    SELECT
        e.source_uid AS node_uid,
        1 AS distance,
        CASE 
            WHEN (SELECT COUNT(*) FROM nhi_edges WHERE target_uid = p_target_uid AND relation_type IN ('authenticates_with', 'reads_secret')) > 1
            THEN 'shared_credential_sibling'
            ELSE 'directly_affected'
        END AS impact_type,
        ARRAY[p_target_uid, e.source_uid] AS relation_path
    FROM nhi_edges e
    WHERE e.target_uid = p_target_uid

    UNION

    -- Recursive step: transitive workloads depending on affected nodes
    SELECT
        e.source_uid AS node_uid,
        dc.distance + 1 AS distance,
        'transitively_affected' AS impact_type,
        dc.relation_path || e.source_uid AS relation_path
    FROM nhi_edges e
    JOIN dependency_chain dc ON e.target_uid = dc.node_uid
    WHERE NOT (e.source_uid = ANY(dc.relation_path))
      AND dc.distance < 10
)
SELECT 
    dc.node_uid,
    n.entity_kind,
    n.display_name,
    dc.distance,
    dc.impact_type,
    dc.relation_path
FROM dependency_chain dc
JOIN nhi_nodes n ON dc.node_uid = n.entity_uid
ORDER BY dc.distance ASC, dc.node_uid ASC;
$$;
