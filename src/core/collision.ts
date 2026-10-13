export interface Point {
  id: string
  x: number
  y: number
}

/** Ids of dancers that are closer than `minDistance` to at least one other dancer. */
export function findCrowded(points: Point[], minDistance: number): Set<string> {
  const crowded = new Set<string>()
  if (minDistance <= 0) return crowded
  const min2 = minDistance * minDistance
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x
      const dy = points[i].y - points[j].y
      if (dx * dx + dy * dy < min2) {
        crowded.add(points[i].id)
        crowded.add(points[j].id)
      }
    }
  }
  return crowded
}
