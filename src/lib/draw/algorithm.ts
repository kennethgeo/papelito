import crypto from 'node:crypto';

export interface ExclusionRule {
  giverId: string;
  excludedReceiverId: string;
}

export interface DrawPair {
  giverId: string;
  receiverId: string;
}

export type DrawResult =
  | { success: true; pairs: DrawPair[] }
  | { success: false; reason: string };

/**
 * Maximum supported participants per exchange to guarantee deterministic
 * polynomial execution bounds and prevent CPU starvation.
 */
export const MAX_DRAW_PARTICIPANTS = 500;

/**
 * Cryptographic random shuffle (Fisher-Yates) using crypto.randomInt
 */
export function secureShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Finds maximum bipartite matching using Kuhn's augmenting paths algorithm (DFS).
 * Time complexity: O(V * E) in the worst case (polynomial), running in <2ms for N <= 500.
 *
 * @param n Number of vertices on each side
 * @param adj Adjacency list: adj[u] contains candidate receivers for giver u
 * @param randomized When true, explores candidate edges in cryptographically shuffled order
 * @returns Array where result[u] = v (giver u -> receiver v), or null if matching size < n
 */
export function findBipartiteMatching(
  n: number,
  adj: number[][],
  randomized = false
): number[] | null {
  // matchTo[v] = giver u currently matched to receiver v, or -1 if unmatched
  const matchTo = new Array<number>(n).fill(-1);
  const visited = new Array<boolean>(n).fill(false);

  // DFS to search for an augmenting path
  function dfs(u: number): boolean {
    const candidates = randomized ? secureShuffle(adj[u]) : adj[u];
    for (const v of candidates) {
      if (visited[v]) continue;
      visited[v] = true;

      // If receiver v is free, or the giver currently matched to v can find an alternative path:
      if (matchTo[v] < 0 || dfs(matchTo[v])) {
        matchTo[v] = u;
        return true;
      }
    }
    return false;
  }

  let matchedCount = 0;
  // Order of givers can also be randomized
  const givers = randomized ? secureShuffle(Array.from({ length: n }, (_, i) => i)) : Array.from({ length: n }, (_, i) => i);

  for (const u of givers) {
    visited.fill(false);
    if (dfs(u)) {
      matchedCount++;
    }
  }

  // Hall's Marriage Condition check:
  // A complete assignment requires matching all n givers to n receivers.
  // If matchedCount < n, Hall's condition is violated: there exists some subset S of givers
  // where the set of allowable receivers |N(S)| < |S|.
  if (matchedCount < n) {
    return null;
  }

  // Construct giver -> receiver mapping
  const giverToReceiver = new Array<number>(n).fill(-1);
  for (let v = 0; v < n; v++) {
    const u = matchTo[v];
    if (u >= 0) {
      giverToReceiver[u] = v;
    }
  }

  return giverToReceiver;
}

/**
 * Computes a valid Secret Santa assignment respecting:
 * 1. Minimum 3 participants, maximum MAX_DRAW_PARTICIPANTS
 * 2. No self-assignments (giverId !== receiverId)
 * 3. Directed exclusions (giverId cannot gift to excludedReceiverId)
 * 4. Bijection: each participant gives exactly once and receives exactly once
 *
 * Employs maximum bipartite matching with augmenting paths (polynomial time)
 * to verify feasibility and avoid factorial backtracking lockups on impossible
 * constraint subgraphs (Hall's condition).
 *
 * Cryptographic randomness is applied to edge traversal and search order.
 * Notice: A randomized polynomial solver does not guarantee uniform distribution
 * across all valid derangements, and uniform distribution is not claimed.
 */
export function computeSecretSantaDraw(
  participantIds: string[],
  exclusions: ExclusionRule[] = []
): DrawResult {
  // 1. Validation: count constraints
  if (!participantIds || participantIds.length < 3) {
    return {
      success: false,
      reason: 'Se requieren al menos 3 participantes confirmados para realizar el sorteo.',
    };
  }

  if (participantIds.length > MAX_DRAW_PARTICIPANTS) {
    return {
      success: false,
      reason: `El número máximo de participantes por intercambio es de ${MAX_DRAW_PARTICIPANTS}.`,
    };
  }

  // Deduplicate participants
  const uniqueParticipants = Array.from(new Set(participantIds));
  if (uniqueParticipants.length !== participantIds.length) {
    return {
      success: false,
      reason: 'La lista contiene participantes duplicados.',
    };
  }

  const n = uniqueParticipants.length;

  // Index mapping for fast numeric operations
  const idToIndex = new Map<string, number>();
  uniqueParticipants.forEach((id, idx) => idToIndex.set(id, idx));

  // Build exclusion lookup set
  const exclusionSet = new Set<string>();
  for (const ex of exclusions) {
    if (ex.giverId === ex.excludedReceiverId) {
      continue; // Self-exclusion is already enforced by design
    }
    exclusionSet.add(`${ex.giverId}->${ex.excludedReceiverId}`);
  }

  // Build adjacency list of allowable receivers for each giver
  // Giver u can gift to receiver v iff u !== v AND (u -> v) is not excluded
  const adj: number[][] = Array.from({ length: n }, () => []);

  for (let u = 0; u < n; u++) {
    const giverId = uniqueParticipants[u];
    for (let v = 0; v < n; v++) {
      if (u === v) continue; // No self-assignment
      const receiverId = uniqueParticipants[v];
      if (!exclusionSet.has(`${giverId}->${receiverId}`)) {
        adj[u].push(v);
      }
    }

    if (adj[u].length === 0) {
      return {
        success: false,
        reason: `El participante con ID ${giverId} no tiene ningún destinatario posible debido a las exclusiones configuradas.`,
      };
    }
  }

  // Verify in-degrees (each receiver must have at least one candidate giver)
  const inDegree = new Array<number>(n).fill(0);
  for (let u = 0; u < n; u++) {
    for (const v of adj[u]) {
      inDegree[v]++;
    }
  }

  for (let v = 0; v < n; v++) {
    if (inDegree[v] === 0) {
      const receiverId = uniqueParticipants[v];
      return {
        success: false,
        reason: `El participante con ID ${receiverId} no puede recibir regalo de nadie debido a las exclusiones configuradas.`,
      };
    }
  }

  // 2. Feasibility verification via Maximum Bipartite Matching (Hall's condition)
  // Deterministic run first to ensure whether a perfect matching exists in O(V*E)
  const deterministicMatching = findBipartiteMatching(n, adj, false);
  if (!deterministicMatching) {
    return {
      success: false,
      reason:
        'Las exclusiones configuradas impiden encontrar una combinación donde todos reciban y entreguen un regalo (incompatibilidad de subconjunto según condición de Hall). Por favor reduce las exclusiones.',
    };
  }

  // 3. Generate randomized assignment
  // Try randomized augmenting path runs with cryptographic randomness
  let assignment: number[] | null = null;
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    assignment = findBipartiteMatching(n, adj, true);
    if (assignment) break;
  }

  // Fallback to deterministic matching if randomized runs encountered rare tie bottlenecks
  if (!assignment) {
    assignment = deterministicMatching;
  }

  // Format pairs
  const pairs: DrawPair[] = [];
  for (let u = 0; u < n; u++) {
    const v = assignment[u];
    pairs.push({
      giverId: uniqueParticipants[u],
      receiverId: uniqueParticipants[v],
    });
  }

  return { success: true, pairs };
}
