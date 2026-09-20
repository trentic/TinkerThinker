import type { LatLng, OsmGolfFeature } from './geo'

export interface AutoMappedHole {
  number: number
  center: LatLng
  outline?: LatLng[]
  par?: number
}

/**
 * Only returns a result when OpenStreetMap has a numbered `golf=hole`
 * feature for every hole 1..holeCount. A partial match (say, 12 of 18
 * numbered) isn't trustworthy enough to present as "here's your course" —
 * it's more confusing than useful, so callers should fall back to the
 * manual tap-through builder instead of showing a half-finished auto-map.
 */
export function tryAutoMapHoles(features: OsmGolfFeature[], holeCount: number): AutoMappedHole[] | null {
  const byNumber = new Map<number, OsmGolfFeature>()

  for (const f of features) {
    if (f.type !== 'hole' || !f.ref) continue
    const n = Number(f.ref)
    if (!Number.isInteger(n) || n < 1 || n > holeCount) continue
    if (!byNumber.has(n)) byNumber.set(n, f)
  }

  if (byNumber.size !== holeCount) return null

  const holes: AutoMappedHole[] = []
  for (let n = 1; n <= holeCount; n++) {
    const f = byNumber.get(n)
    if (!f) return null
    holes.push({ number: n, center: f.point, outline: f.outline, par: f.par })
  }
  return holes
}
