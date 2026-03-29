/**
 * Greedy nearest-neighbor ordering using Euclidean distance.
 * Produces a good visual grouping for heatmaps without full
 * hierarchical clustering.
 */

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * Given a set of vectors, returns an ordering of indices such that
 * similar vectors are adjacent.
 *
 * Algorithm:
 * 1. Start with index 0
 * 2. Find the nearest unvisited vector
 * 3. Add it to the ordering
 * 4. Repeat until all vectors are ordered
 */
export function greedyOrder(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  if (vectors.length === 1) return [0];

  const visited = new Set<number>();
  const order: number[] = [0];
  visited.add(0);

  while (order.length < vectors.length) {
    const current = order[order.length - 1];
    let nearest = -1;
    let nearestDist = Infinity;

    for (let i = 0; i < vectors.length; i++) {
      if (visited.has(i)) continue;
      const dist = euclideanDistance(vectors[current], vectors[i]);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    }

    order.push(nearest);
    visited.add(nearest);
  }

  return order;
}

/**
 * Orders both rows (students) and columns (tags) of a matrix
 * by similarity for heatmap visualization.
 */
export function clusterMatrix(
  matrix: number[][]
): { rowOrder: number[]; colOrder: number[] } {
  if (matrix.length === 0) return { rowOrder: [], colOrder: [] };

  const rowOrder = greedyOrder(matrix);

  // Transpose matrix for column ordering
  const cols = matrix[0]?.length ?? 0;
  const transposed: number[][] = [];
  for (let c = 0; c < cols; c++) {
    transposed.push(matrix.map((row) => row[c]));
  }

  const colOrder = greedyOrder(transposed);

  return { rowOrder, colOrder };
}
