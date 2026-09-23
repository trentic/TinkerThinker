import { fetchOsmGolfFeatures, type LatLng, type OsmBoundaryRef, type OsmGolfFeature } from './geo'
import { tryAutoMapHoles, type AutoMappedHole } from './courseAutoMap'

export interface ParThreeCompanion {
  center: LatLng
  holes: AutoMappedHole[]
}

export interface ParThreeCompanionCheck {
  companion: ParThreeCompanion | null
  // What was left over near the main course after subtracting its own
  // features, regardless of whether it added up to a complete course —
  // shown in the UI so a "nothing found" result is visible/debuggable
  // instead of just silently doing nothing.
  leftoverFeatureCounts: Partial<Record<OsmGolfFeature['type'], number>>
  leftoverHoleRefs: string[]
}

// A facility's par-3/executive layout is often mapped on OpenStreetMap as
// plain golf=hole points with no leisure=golf_course polygon of its own —
// so searching for a second NAMED course boundary nearby (see
// lib/geo.ts's fetchSiblingCourses) finds nothing. This widens the net: a
// broad, unscoped sweep for every golf-tagged feature nearby, minus
// whatever the main course's own (boundary-scoped, when possible) fetch
// already claimed. If the leftover golf=hole features form a clean 1..9 or
// 1..18 numbered set — the same strict all-or-nothing match
// tryAutoMapHoles already applies to the main course — that's almost
// certainly the companion course.
const WIDE_SWEEP_RADIUS_M = 1500

function featureKey(f: OsmGolfFeature): string {
  return `${f.point.lat.toFixed(6)},${f.point.lng.toFixed(6)}`
}

export async function findParThreeCompanion(
  center: LatLng,
  mainBoundary?: OsmBoundaryRef,
): Promise<ParThreeCompanionCheck> {
  const [mainFeatures, wideFeatures] = await Promise.all([
    fetchOsmGolfFeatures(center, { boundary: mainBoundary }),
    fetchOsmGolfFeatures(center, { radiusMeters: WIDE_SWEEP_RADIUS_M }),
  ])

  const claimed = new Set(mainFeatures.map(featureKey))
  const leftover = wideFeatures.filter((f) => !claimed.has(featureKey(f)))

  const leftoverFeatureCounts: Partial<Record<OsmGolfFeature['type'], number>> = {}
  for (const f of leftover) leftoverFeatureCounts[f.type] = (leftoverFeatureCounts[f.type] ?? 0) + 1

  const leftoverHoles = leftover.filter((f) => f.type === 'hole')
  const leftoverHoleRefs = leftoverHoles.map((f) => f.ref ?? '?').sort()

  const holes =
    leftoverHoles.length > 0 ? (tryAutoMapHoles(leftoverHoles, 9) ?? tryAutoMapHoles(leftoverHoles, 18)) : null

  if (!holes) return { companion: null, leftoverFeatureCounts, leftoverHoleRefs }

  const companionCenter = holes.reduce(
    (sum, h) => ({ lat: sum.lat + h.center.lat / holes.length, lng: sum.lng + h.center.lng / holes.length }),
    { lat: 0, lng: 0 },
  )
  return { companion: { center: companionCenter, holes }, leftoverFeatureCounts, leftoverHoleRefs }
}
