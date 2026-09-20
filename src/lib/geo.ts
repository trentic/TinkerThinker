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

export function getCurrentPosition(options?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not available on this device/browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 5_000,
      ...options,
    })
  })
}

export interface GeocodeResult {
  displayName: string
  lat: number
  lng: number
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

  const results = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>
  return results.map((r) => ({
    displayName: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }))
}

export interface OsmGolfFeature {
  type: 'hole' | 'tee' | 'green' | 'bunker' | 'water_hazard' | 'fairway'
  ref?: string // hole number, when tagged
  par?: number
  lat: number
  lng: number
}

// Pulls whatever golf-tagged features Overpass/OSM has near a course center.
// Coverage varies wildly by course — this is a best-effort pre-fill, not a
// guaranteed source. The tap-through hole builder is the reliable fallback.
export async function fetchOsmGolfFeatures(
  center: LatLng,
  radiusMeters = 1200,
): Promise<OsmGolfFeature[]> {
  const query = `
    [out:json][timeout:25];
    (
      nwr(around:${radiusMeters},${center.lat},${center.lng})["golf"];
      nwr(around:${radiusMeters},${center.lat},${center.lng})["leisure"="golf_course"];
    );
    out center tags;
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
    }>
  }

  const features: OsmGolfFeature[] = []
  for (const el of data.elements) {
    const tags = el.tags ?? {}
    const golfTag = tags.golf
    if (!golfTag) continue
    const pos = el.center ?? (el.lat && el.lon ? { lat: el.lat, lon: el.lon } : undefined)
    if (!pos) continue

    const typeMap: Record<string, OsmGolfFeature['type']> = {
      hole: 'hole',
      tee: 'tee',
      green: 'green',
      bunker: 'bunker',
      water_hazard: 'water_hazard',
      fairway: 'fairway',
    }
    const type = typeMap[golfTag]
    if (!type) continue

    features.push({
      type,
      ref: tags.ref,
      par: tags.par ? Number(tags.par) : undefined,
      lat: pos.lat,
      lng: pos.lon,
    })
  }
  return features
}
