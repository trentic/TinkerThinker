import type { LatLng } from './geo'
import { distanceYards } from './geo'

// Open-Meteo: free, no API key, no rate-limit headaches for this usage.
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation'
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast'

export async function getElevationMeters(points: LatLng[]): Promise<number[]> {
  const url = new URL(ELEVATION_URL)
  url.searchParams.set('latitude', points.map((p) => p.lat).join(','))
  url.searchParams.set('longitude', points.map((p) => p.lng).join(','))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Elevation lookup failed: ${res.status}`)
  const data = (await res.json()) as { elevation: number[] }
  return data.elevation
}

export interface WindInfo {
  speedMph: number
  directionDeg: number // meteorological: direction the wind is blowing FROM
}

export async function getCurrentWind(point: LatLng): Promise<WindInfo> {
  const url = new URL(WEATHER_URL)
  url.searchParams.set('latitude', String(point.lat))
  url.searchParams.set('longitude', String(point.lng))
  url.searchParams.set('current', 'wind_speed_10m,wind_direction_10m')
  url.searchParams.set('wind_speed_unit', 'mph')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Wind lookup failed: ${res.status}`)
  const data = (await res.json()) as {
    current: { wind_speed_10m: number; wind_direction_10m: number }
  }
  return {
    speedMph: data.current.wind_speed_10m,
    directionDeg: data.current.wind_direction_10m,
  }
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** Compass direction the wind is blowing FROM, e.g. 12mph "from NW". */
export function windCompassLabel(directionDeg: number): string {
  const index = Math.round(directionDeg / 45) % 8
  return COMPASS_POINTS[index]
}

function bearingDeg(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const lat1 = toRad(from.lat)
  const lat2 = toRad(to.lat)
  const dLng = toRad(to.lng - from.lng)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export interface PlaysLikeResult {
  actualYards: number
  elevationAdjustYards: number
  windAdjustYards: number
  playsLikeYards: number
}

/**
 * Approximate "plays like" yardage. This intentionally uses simple,
 * well-known rules of thumb, not real ballistic modeling (launch angle,
 * spin, club-specific trajectory) — that data isn't available for free.
 * Elevation: ~1 yard of adjustment per yard of elevation change (uphill
 * plays longer, downhill shorter). Wind: ~1% of distance per mph of
 * head/tailwind component; crosswind only affects the wind component via
 * the cosine of the angle between shot line and wind direction.
 */
export function calculatePlaysLike(params: {
  from: LatLng
  to: LatLng
  fromElevationM: number
  toElevationM: number
  wind: WindInfo
}): PlaysLikeResult {
  const { from, to, fromElevationM, toElevationM, wind } = params
  const actualYards = distanceYards(from, to)

  const elevationChangeYards = (toElevationM - fromElevationM) / 0.9144
  const elevationAdjustYards = elevationChangeYards

  const shotBearing = bearingDeg(from, to)
  // Wind direction is "from"; the component blowing INTO the shot (headwind)
  // is when wind is coming from roughly the same direction as travel.
  const windFromBearing = wind.directionDeg
  const angleDiff = Math.abs(((shotBearing - windFromBearing + 540) % 360) - 180)
  const headwindComponent = Math.cos((angleDiff * Math.PI) / 180) * wind.speedMph
  const windAdjustYards = actualYards * 0.01 * headwindComponent

  const playsLikeYards = actualYards + elevationAdjustYards + windAdjustYards

  return {
    actualYards: Math.round(actualYards),
    elevationAdjustYards: Math.round(elevationAdjustYards),
    windAdjustYards: Math.round(windAdjustYards),
    playsLikeYards: Math.round(playsLikeYards),
  }
}
