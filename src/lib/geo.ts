import { readMockPositionIfDebugging } from './debugLocation'

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6_371_000
const METERS_PER_YARD = 0.9144

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

export function distanceYards(a: LatLng, b: LatLng): number {
  return distanceMeters(a, b) / METERS_PER_YARD
}

/** Walks `distanceYards` from `start` along `bearingDeg` (0 = north, 90 = east). */
export function destinationPoint(start: LatLng, bearingDeg: number, distanceYards: number): LatLng {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const angularDist = (distanceYards * METERS_PER_YARD) / EARTH_RADIUS_M
  const bearing = toRad(bearingDeg)
  const lat1 = toRad(start.lat)
  const lng1 = toRad(start.lng)

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDist) + Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearing),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat1),
      Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2),
    )

  return { lat: toDeg(lat2), lng: toDeg(lng2) }
}

/** Compass bearing from `from` to `to`, in degrees (0 = north, 90 = east). */
export function bearingDeg(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const lat1 = toRad(from.lat)
  const lat2 = toRad(to.lat)
  const dLng = toRad(to.lng - from.lng)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function fakeGeolocationPosition(pos: LatLng): GeolocationPosition {
  const coords: GeolocationCoordinates = {
    latitude: pos.lat,
    longitude: pos.lng,
    accuracy: 5,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON() {
      return this
    },
  }
  return {
    coords,
    timestamp: Date.now(),
    toJSON() {
      return this
    },
  }
}

// A single getCurrentPosition() call often hands back the phone's first,
// coarse fix — cell-tower/WiFi triangulation — before the GPS chip has
// locked onto enough satellites to narrow it down, sometimes off by 50m+.
// Below this accuracy (meters), a fix is considered good enough to stop
// waiting for a better one.
const GOOD_ENOUGH_ACCURACY_M = 8

export function getCurrentPosition(options?: PositionOptions): Promise<GeolocationPosition> {
  // Testing-only mock GPS (see lib/debugLocation.ts) — deliberately checked
  // before touching real geolocation at all.
  const mock = readMockPositionIfDebugging()
  if (mock) return Promise.resolve(fakeGeolocationPosition(mock))

  if (!('geolocation' in navigator)) {
    return Promise.reject(new Error('Geolocation is not available on this device/browser.'))
  }

  const timeoutMs = options?.timeout ?? 8_000

  // watchPosition instead of a single getCurrentPosition call: keep the most
  // accurate fix seen while the GPS chip's lock improves, stopping early
  // once it's good enough rather than settling for whatever arrived first.
  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      navigator.geolocation.clearWatch(watchId)
      if (best) resolve(best)
      else reject(new Error('Could not get a GPS fix.'))
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos
        if (pos.coords.accuracy <= GOOD_ENOUGH_ACCURACY_M) finish()
      },
      () => {
        // A mid-stream error only fails the call if no fix arrived at all —
        // one flaky reading shouldn't discard an already-good one.
        if (!best) finish()
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs, ...options },
    )
    const timer = setTimeout(finish, timeoutMs)
  })
}

// A golf_course polygon's own OSM element — a "way" (simple polygon) or
// "relation" (multipolygon). Never "node": a bare point can't be used as an
// area boundary, so callers fall back to radius-based fetching for those.
export type OsmBoundaryRef = { osmType: 'way' | 'relation'; osmId: number }

export interface GeocodeResult {
  displayName: string
  lat: number
  lng: number
  boundary?: OsmBoundaryRef
}

// Nominatim (OpenStreetMap's free geocoder). Usage policy: max ~1 req/sec,
// identify via a descriptive User-Agent/Referer (browsers set Referer
// automatically), no bulk/automated querying. Fine for a user typing a
// course name occasionally.
export async function searchCourseLocation(query: string): Promise<GeocodeResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', `${query} golf course`)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '5')

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Course search failed: ${res.status}`)

  const results = (await res.json()) as Array<{
    display_name: string
    lat: string
    lon: string
    osm_type?: string
    osm_id?: number
  }>
  return results.map((r) => ({
    displayName: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    boundary:
      (r.osm_type === 'way' || r.osm_type === 'relation') && r.osm_id !== undefined
        ? { osmType: r.osm_type, osmId: r.osm_id }
        : undefined,
  }))
}

export interface NearbyCourse {
  name: string
  point: LatLng
  distanceMeters: number
  boundary?: OsmBoundaryRef
}

// Finds named golf courses (leisure=golf_course areas/points) near a
// location, sorted closest-first. Used both for "use my location" (a wide
// radius, offering actual nearby courses instead of just centering the map
// on wherever the phone's GPS happens to be standing) and for detecting a
// sibling course at the same facility (a tight radius — see
// fetchSiblingCourses).
export async function fetchNearbyGolfCourses(center: LatLng, radiusMeters = 20_000): Promise<NearbyCourse[]> {
  const query = `
    [out:json][timeout:25];
    nwr(around:${radiusMeters},${center.lat},${center.lng})["leisure"="golf_course"]["name"];
    out center tags;
  `
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
  })
  if (!res.ok) return []

  const data = (await res.json()) as {
    elements: Array<{
      type: 'node' | 'way' | 'relation'
      id: number
      tags?: Record<string, string>
      lat?: number
      lon?: number
      center?: { lat: number; lon: number }
    }>
  }

  const courses: NearbyCourse[] = []
  for (const el of data.elements) {
    const name = el.tags?.name
    if (!name) continue
    const pos = el.center
      ? { lat: el.center.lat, lng: el.center.lon }
      : el.lat !== undefined && el.lon !== undefined
        ? { lat: el.lat, lng: el.lon }
        : undefined
    if (!pos) continue
    courses.push({
      name,
      point: pos,
      distanceMeters: distanceMeters(center, pos),
      boundary: el.type === 'way' || el.type === 'relation' ? { osmType: el.type, osmId: el.id } : undefined,
    })
  }

  courses.sort((a, b) => a.distanceMeters - b.distanceMeters)
  return courses.slice(0, 3)
}

// Facilities commonly run more than one course from the same clubhouse — a
// regulation course plus a shorter par-3/executive course — close enough
// together that a plain radius search can't tell them apart. A tight radius
// here surfaces those as distinct, pickable siblings instead of silently
// merging their holes together (see fetchOsmGolfFeatures's boundary mode).
export async function fetchSiblingCourses(
  center: LatLng,
  excludeName?: string,
  radiusMeters = 600,
): Promise<NearbyCourse[]> {
  const nearby = await fetchNearbyGolfCourses(center, radiusMeters)
  return nearby.filter((c) => c.name !== excludeName)
}

export interface OsmGolfFeature {
  type: 'hole' | 'tee' | 'green' | 'bunker' | 'water_hazard' | 'fairway'
  ref?: string // hole number, when tagged
  par?: number
  point: LatLng // representative point (a node's own position, or a way's centroid)
  outline?: LatLng[] // full way geometry, when this feature is a line/area rather than a point
}

// Pulls whatever golf-tagged features Overpass/OSM has for a course,
// including full way geometry (so hole/fairway outlines can be drawn, not
// just a center dot). Coverage varies wildly by course — this is a
// best-effort pre-fill, not a guaranteed source. The tap-through hole
// builder is the reliable fallback.
//
// When `boundary` is available (the course's own way/relation from
// Nominatim or fetchNearbyGolfCourses), the query is scoped to strictly
// inside that polygon — critical when another course shares the same
// clubhouse nearby, since a flat radius around a point can't distinguish
// whose holes are whose. Without a boundary (manual/GPS-only entry, or OSM
// simply has no polygon for it), falls back to the old radius search.
export async function fetchOsmGolfFeatures(
  center: LatLng,
  options?: { radiusMeters?: number; boundary?: OsmBoundaryRef },
): Promise<OsmGolfFeature[]> {
  const radiusMeters = options?.radiusMeters ?? 1200
  const boundary = options?.boundary
  const query = boundary
    ? `
      [out:json][timeout:25];
      ${boundary.osmType}(${boundary.osmId})->.course;
      .course map_to_area->.courseArea;
      nwr(area.courseArea)["golf"];
      out body geom;
    `
    : `
      [out:json][timeout:25];
      (
        nwr(around:${radiusMeters},${center.lat},${center.lng})["golf"];
        nwr(around:${radiusMeters},${center.lat},${center.lng})["leisure"="golf_course"];
      );
      out body geom;
    `
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
  })
  if (!res.ok) return []

  const data = (await res.json()) as {
    elements: Array<{
      tags?: Record<string, string>
      lat?: number
      lon?: number
      center?: { lat: number; lon: number }
      geometry?: Array<{ lat: number; lon: number }>
    }>
  }

  const typeMap: Record<string, OsmGolfFeature['type']> = {
    hole: 'hole',
    tee: 'tee',
    green: 'green',
    bunker: 'bunker',
    water_hazard: 'water_hazard',
    fairway: 'fairway',
  }

  const features: OsmGolfFeature[] = []
  for (const el of data.elements) {
    const tags = el.tags ?? {}
    const type = typeMap[tags.golf]
    if (!type) continue

    if (el.geometry && el.geometry.length > 0) {
      const outline = el.geometry.map((g) => ({ lat: g.lat, lng: g.lon }))
      const centroid = outline.reduce(
        (sum, p) => ({ lat: sum.lat + p.lat / outline.length, lng: sum.lng + p.lng / outline.length }),
        { lat: 0, lng: 0 },
      )
      features.push({ type, ref: tags.ref, par: tags.par ? Number(tags.par) : undefined, point: centroid, outline })
      continue
    }

    const center = el.center
      ? { lat: el.center.lat, lng: el.center.lon }
      : el.lat !== undefined && el.lon !== undefined
        ? { lat: el.lat, lng: el.lon }
        : undefined
    if (!center) continue
    features.push({ type, ref: tags.ref, par: tags.par ? Number(tags.par) : undefined, point: center })
  }
  return features
}
