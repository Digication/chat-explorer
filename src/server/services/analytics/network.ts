import { AppDataSource } from "../../data-source.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";
import { ToriTag } from "../../entities/ToriTag.js";
import type { AnalyticsScope, AnalyticsResult } from "./types.js";
import { resolveScope } from "./scope.js";
import { withCache } from "./cache.js";

export interface NetworkNode {
  id: string;
  name: string;
  domain: string;
  frequency: number;
  degree: number;
  communityId: number;
}

export interface NetworkEdge {
  source: string; // tag ID
  target: string; // tag ID
  weight: number; // co-occurrence count
}

export interface Community {
  id: number;
  nodeIds: string[];
}

export interface NetworkData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  communities: Community[];
}

/**
 * Louvain community detection (simplified).
 * Iteratively moves nodes to the community maximizing modularity gain.
 */
function louvainCommunities(
  nodeIds: string[],
  edges: NetworkEdge[]
): Map<string, number> {
  const community = new Map<string, number>();
  nodeIds.forEach((id, i) => community.set(id, i));

  // Build adjacency
  const adj = new Map<string, Map<string, number>>();
  for (const id of nodeIds) adj.set(id, new Map());
  let totalWeight = 0;
  for (const e of edges) {
    adj.get(e.source)?.set(e.target, e.weight);
    adj.get(e.target)?.set(e.source, e.weight);
    totalWeight += e.weight;
  }
  if (totalWeight === 0) return community;

  // Node strength (sum of edge weights)
  const strength = new Map<string, number>();
  for (const id of nodeIds) {
    let s = 0;
    for (const w of adj.get(id)?.values() ?? []) s += w;
    strength.set(id, s);
  }

  // Iterate until no improvement
  let improved = true;
  const maxIterations = 10;
  let iter = 0;

  while (improved && iter < maxIterations) {
    improved = false;
    iter++;

    for (const nodeId of nodeIds) {
      const currentComm = community.get(nodeId)!;
      const ki = strength.get(nodeId)!;
      const neighbors = adj.get(nodeId)!;

      // Compute modularity gain for moving to each neighboring community
      const commWeights = new Map<number, number>();
      for (const [neighbor, weight] of neighbors) {
        const nComm = community.get(neighbor)!;
        commWeights.set(nComm, (commWeights.get(nComm) ?? 0) + weight);
      }

      // Sum of weights within current community
      const currentCommWeight = commWeights.get(currentComm) ?? 0;

      // Community total strengths
      const commStrength = new Map<number, number>();
      for (const [id, comm] of community) {
        commStrength.set(
          comm,
          (commStrength.get(comm) ?? 0) + (strength.get(id) ?? 0)
        );
      }

      let bestComm = currentComm;
      let bestGain = 0;

      for (const [targetComm, edgeWeight] of commWeights) {
        if (targetComm === currentComm) continue;
        const sigmaTot = commStrength.get(targetComm) ?? 0;
        const sigmaTotCurrent =
          (commStrength.get(currentComm) ?? 0) - ki;

        // Modularity gain approximation
        const gain =
          (edgeWeight - currentCommWeight) / totalWeight -
          (ki * (sigmaTot - sigmaTotCurrent)) / (2 * totalWeight * totalWeight);

        if (gain > bestGain) {
          bestGain = gain;
          bestComm = targetComm;
        }
      }

      if (bestComm !== currentComm) {
        community.set(nodeId, bestComm);
        improved = true;
      }
    }
  }

  // Renumber communities to be contiguous
  const uniqueComms = [...new Set(community.values())];
  const renumber = new Map(uniqueComms.map((c, i) => [c, i]));
  for (const [id, comm] of community) {
    community.set(id, renumber.get(comm)!);
  }

  return community;
}

export async function getNetwork(
  scope: AnalyticsScope,
  minEdgeWeight: number = 2
): Promise<AnalyticsResult<NetworkData>> {
  const cacheKey = `network:${minEdgeWeight}:${JSON.stringify(scope)}`;
  const resolved = await resolveScope(scope);
  const userComments = resolved.comments.filter((c) => c.role === "USER");
  const commentIds = userComments.map((c) => c.id);

  const { data, cached } = await withCache(cacheKey, scope, async () => {
    if (commentIds.length === 0) {
      return { nodes: [], edges: [], communities: [] };
    }

    const cttRepo = AppDataSource.getRepository(CommentToriTag);
    const associations = await cttRepo
      .createQueryBuilder("ctt")
      .where("ctt.commentId IN (:...ids)", { ids: commentIds })
      .getMany();

    const tagRepo = AppDataSource.getRepository(ToriTag);
    const allTags = await tagRepo.find();
    const tagMap = new Map(allTags.map((t) => [t.id, t]));

    // Group tags by comment
    const tagsByComment = new Map<string, string[]>();
    const tagFrequency = new Map<string, number>();

    for (const assoc of associations) {
      tagFrequency.set(
        assoc.toriTagId,
        (tagFrequency.get(assoc.toriTagId) ?? 0) + 1
      );
      if (!tagsByComment.has(assoc.commentId)) {
        tagsByComment.set(assoc.commentId, []);
      }
      tagsByComment.get(assoc.commentId)!.push(assoc.toriTagId);
    }

    // Build co-occurrence edges
    const edgeMap = new Map<string, number>();
    for (const tags of tagsByComment.values()) {
      const unique = [...new Set(tags)].sort();
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const key = `${unique[i]}|${unique[j]}`;
          edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
        }
      }
    }

    // Filter edges by minimum weight
    const edges: NetworkEdge[] = [];
    for (const [key, weight] of edgeMap) {
      if (weight < minEdgeWeight) continue;
      const [source, target] = key.split("|");
      edges.push({ source, target, weight });
    }

    // Only include nodes that have at least one edge
    const nodeIdsInEdges = new Set<string>();
    for (const e of edges) {
      nodeIdsInEdges.add(e.source);
      nodeIdsInEdges.add(e.target);
    }

    // Compute degree per node
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }

    // Community detection
    const nodeIds = [...nodeIdsInEdges];
    const communityMap = louvainCommunities(nodeIds, edges);

    // Build nodes
    const nodes: NetworkNode[] = nodeIds.map((id) => {
      const tag = tagMap.get(id);
      return {
        id,
        name: tag?.name ?? "Unknown",
        domain: tag?.domain ?? "Unknown",
        frequency: tagFrequency.get(id) ?? 0,
        degree: degree.get(id) ?? 0,
        communityId: communityMap.get(id) ?? 0,
      };
    });

    // Build communities
    const commGroups = new Map<number, string[]>();
    for (const [id, comm] of communityMap) {
      if (!commGroups.has(comm)) commGroups.set(comm, []);
      commGroups.get(comm)!.push(id);
    }
    const communities: Community[] = [...commGroups.entries()].map(
      ([id, nodeIds]) => ({ id, nodeIds })
    );

    return { nodes, edges, communities };
  });

  return {
    data,
    meta: {
      scope,
      consentedStudentCount: resolved.consentedStudentIds.length,
      excludedStudentCount: resolved.excludedCount,
      computedAt: new Date(),
      cached,
    },
  };
}
