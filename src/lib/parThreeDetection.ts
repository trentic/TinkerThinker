import { fetchOsmGolfFeatures, type LatLng, type OsmBoundaryRef, type OsmGolfFeature } from './geo'
import { tryAutoMapHoles, type AutoMappedHole } from './courseAutoMap'

export interface ParThreeCompanion {
  center: LatLng
  holes: AutoMappedHole[]
}

// A facility's par-3/executive layout is often mapped on OpenStreetMap as
// plain golf=hole points with no leisure=golf_course polygon of its own —
// so searching for a second NAMED course boundary nearby (see
// lib/geo.ts's fetchSiblingCourses) finds nothing. This widens the net: a
// broad, unscoped sweep for every golf=hole feature nearby, minus whatever
// the main course's own (boundary-scoped, when possible) fetch already
// claimed. If what's left forms a clean 1..9 or 1..18 numbered set — the
// same strict all-or-nothing match tryAutoMapHoles already applies to the
// main course — that's almost certainly the companion course.
const WIDE_SWEEP_RADIUS_M = 1500

function holeKey(f: OsmGolfFeature): string {
  return `${f.point.lat.toFixed(6)},${f.point.lng.toFixed(6)}`
}

export async function findParThreeCompanion(
  center: LatLng,
  mainBoundary?: OsmBoundaryRef,
): Promise<ParThreeCompanion | null> {
  const [mainFeatures, wideFeatures] = await Promise.all([
    fetchOsmGolfFeatures(center, { boundary: mainBoundary }),
    fetchOsmGolfFeatures(center, { radiusMeters: WIDE_SWEEP_RADIUS_M }),
  ])

  const claimed = new Set(mainFeatures.filter((f) => f.type === 'hole').map(holeKey))
  const leftoverHoles = wideFeatures.filter((f) => f.type === 'hole' && !claimed.has(holeKey(f)))
  if (leftoverHoles.length === 0) return null

  const holes = tryAutoMapHoles(leftoverHoles, 9) ?? tryAutoMapHoles(leftoverHoles, 18)
  if (!holes) return null

  const center2 = holes.reduce(
    (sum, h) => ({ lat: sum.lat + h.center.lat / holes.length, lng: sum.lng + h.center.lng / holes.length }),
    { lat: 0, lng: 0 },
  )
  return { center: center2, holes }
}
