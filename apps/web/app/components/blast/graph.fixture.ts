export type NodeKind = 'agent' | 'service-account' | 'token' | 'secret' | 'resource';

export interface GNode {
  id: string;
  kind: NodeKind;
  label: string;
  sublabel?: string;
  sensitive?: boolean;
  x: number;
  y: number;
}

export interface GEdge {
  from: string;
  to: string;
  rel: 'uses' | 'assumes' | 'grants' | 'reads';
}

/**
 * Deterministic precomputed graph layout (28 nodes, fixed SVG canvas 800 x 480).
 * Structured into 4 columns:
 *   Col 1: Autonomous Agents (x ~ 80)
 *   Col 2: Identity Tokens & Service Accounts (x ~ 280)
 *   Col 3: Cloud Roles & Intermediary Secrets (x ~ 500)
 *   Col 4: Sensitive Resources & Datastores (x ~ 720)
 */
export const SAMPLE_GRAPH_NODES: GNode[] = [
  // Autonomous Agents
  { id: 'agent-data-analyst', kind: 'agent', label: 'agent:data-analyst', sublabel: 'LangChain runtime', x: 80, y: 70 },
  { id: 'agent-devops-copilot', kind: 'agent', label: 'agent:devops-bot', sublabel: 'Claude Code worker', x: 80, y: 170 },
  { id: 'agent-support-ai', kind: 'agent', label: 'agent:customer-support', sublabel: 'OpenAI assistant', x: 80, y: 270 },
  { id: 'agent-marketing-gen', kind: 'agent', label: 'agent:content-bot', sublabel: 'CrewAI runner', x: 80, y: 370 },
  { id: 'agent-fin-recon', kind: 'agent', label: 'agent:financial-recon', sublabel: 'Autonomous cron', x: 80, y: 440 },

  // Tokens & Ephemeral Credentials (Leaked token target: tok-gh-app-sec)
  { id: 'tok-gh-app-sec', kind: 'token', label: 'token:github-pat-prod', sublabel: 'LEAK TARGET · Scoped PAT', sensitive: true, x: 280, y: 70 },
  { id: 'tok-k8s-sa-core', kind: 'token', label: 'token:k8s-pod-jwt', sublabel: 'Projected volume token', x: 280, y: 150 },
  { id: 'tok-aws-session', kind: 'token', label: 'token:sts-assumed-role', sublabel: '1-hr dynamic lease', x: 280, y: 230 },
  { id: 'tok-slack-bot', kind: 'token', label: 'token:slack-xoxb', sublabel: 'Enterprise bot token', x: 280, y: 310 },
  { id: 'tok-db-proxy-user', kind: 'token', label: 'token:vault-db-lease', sublabel: '15-min ephemeral lease', x: 280, y: 390 },

  // Service Accounts & Roles
  { id: 'sa-cicd-runner', kind: 'service-account', label: 'sa:github-actions', sublabel: 'Repo deployment identity', x: 490, y: 50 },
  { id: 'sa-k8s-workload', kind: 'service-account', label: 'sa:axiom-evaluator', sublabel: 'Cluster service account', x: 490, y: 130 },
  { id: 'role-aws-prod-admin', kind: 'service-account', label: 'role:iam-production-admin', sublabel: 'Broad IAM role', sensitive: true, x: 490, y: 210 },
  { id: 'secret-stripe-api', kind: 'secret', label: 'secret:stripe-live-key', sublabel: 'Vault leased key', sensitive: true, x: 490, y: 290 },
  { id: 'secret-db-prod-cred', kind: 'secret', label: 'secret:postgres-superuser', sublabel: 'Production DB master', sensitive: true, x: 490, y: 370 },
  { id: 'secret-jwt-signing', kind: 'secret', label: 'secret:idp-rsa-private', sublabel: 'Root identity signing key', sensitive: true, x: 490, y: 440 },

  // End Resources & Sensitive Datastores
  { id: 'res-github-org', kind: 'resource', label: 'repo:axiom-core-repo', sublabel: 'Proprietary source code', sensitive: true, x: 710, y: 40 },
  { id: 'res-github-secrets', kind: 'resource', label: 'repo:actions-secrets', sublabel: 'CI deployment secrets', sensitive: true, x: 710, y: 100 },
  { id: 'res-s3-prod-backups', kind: 'resource', label: 's3:customer-pii-backups', sublabel: 'Unencrypted cold storage', sensitive: true, x: 710, y: 160 },
  { id: 'res-kms-master-key', kind: 'resource', label: 'kms:root-envelope-key', sublabel: 'HSM cryptographic root', sensitive: true, x: 710, y: 220 },
  { id: 'res-db-customers', kind: 'resource', label: 'pg:table-customers', sublabel: '1.4M user records & PII', sensitive: true, x: 710, y: 280 },
  { id: 'res-db-billing', kind: 'resource', label: 'pg:table-billing-cards', sublabel: 'PCI-DSS token vault', sensitive: true, x: 710, y: 340 },
  { id: 'res-slack-private', kind: 'resource', label: 'slack:c-exec-confidential', sublabel: 'Private executive channel', sensitive: true, x: 710, y: 400 },
  { id: 'res-k8s-secrets', kind: 'resource', label: 'k8s:kube-system-secrets', sublabel: 'Cluster admin certificates', sensitive: true, x: 710, y: 450 },
];

export const SAMPLE_GRAPH_EDGES: GEdge[] = [
  // Agent to Token
  { from: 'agent-data-analyst', to: 'tok-gh-app-sec', rel: 'uses' },
  { from: 'agent-devops-copilot', to: 'tok-gh-app-sec', rel: 'uses' },
  { from: 'agent-devops-copilot', to: 'tok-k8s-sa-core', rel: 'uses' },
  { from: 'agent-support-ai', to: 'tok-slack-bot', rel: 'uses' },
  { from: 'agent-fin-recon', to: 'tok-aws-session', rel: 'uses' },
  { from: 'agent-fin-recon', to: 'tok-db-proxy-user', rel: 'uses' },

  // Token to Service Account / Secret
  { from: 'tok-gh-app-sec', to: 'sa-cicd-runner', rel: 'grants' },
  { from: 'tok-gh-app-sec', to: 'res-github-org', rel: 'reads' },
  { from: 'tok-k8s-sa-core', to: 'sa-k8s-workload', rel: 'assumes' },
  { from: 'tok-aws-session', to: 'role-aws-prod-admin', rel: 'assumes' },
  { from: 'tok-db-proxy-user', to: 'secret-db-prod-cred', rel: 'reads' },

  // Service Account to Intermediary & End Resources
  { from: 'sa-cicd-runner', to: 'res-github-secrets', rel: 'reads' },
  { from: 'sa-cicd-runner', to: 'role-aws-prod-admin', rel: 'assumes' },
  { from: 'role-aws-prod-admin', to: 'res-s3-prod-backups', rel: 'reads' },
  { from: 'role-aws-prod-admin', to: 'res-kms-master-key', rel: 'uses' },
  { from: 'role-aws-prod-admin', to: 'res-k8s-secrets', rel: 'reads' },
  { from: 'secret-db-prod-cred', to: 'res-db-customers', rel: 'grants' },
  { from: 'secret-db-prod-cred', to: 'res-db-billing', rel: 'grants' },
  { from: 'tok-slack-bot', to: 'res-slack-private', rel: 'reads' },
];

/**
 * Breadth-first search traversal along directed edges to find reachable node IDs.
 */
export function computeReachable(
  startNodeId: string,
  _nodes: GNode[],
  edges: GEdge[]
): { reachableIds: Set<string>; hops: Map<string, number> } {
  const reachableIds = new Set<string>();
  const hops = new Map<string, number>();

  const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }];
  reachableIds.add(startNodeId);
  hops.set(startNodeId, 0);

  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adj.has(edge.from)) {
      adj.set(edge.from, []);
    }
    adj.get(edge.from)!.push(edge.to);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adj.get(current.id) || [];

    for (const neighbor of neighbors) {
      if (!reachableIds.has(neighbor)) {
        reachableIds.add(neighbor);
        hops.set(neighbor, current.depth + 1);
        queue.push({ id: neighbor, depth: current.depth + 1 });
      }
    }
  }

  return { reachableIds, hops };
}
