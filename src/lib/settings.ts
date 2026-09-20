// Small local device preferences that aren't round/course data, so they
// live in localStorage rather than IndexedDB.

const MULLIGAN_ENABLED_KEY = 'fairway:mulliganEnabled'

export function isMulliganEnabled(): boolean {
  const raw = localStorage.getItem(MULLIGAN_ENABLED_KEY)
  return raw === null ? true : raw === 'true'
}

export function setMulliganEnabled(enabled: boolean): void {
  localStorage.setItem(MULLIGAN_ENABLED_KEY, String(enabled))
}

const DEBUG_LOCATION_KEY = 'fairway:debugLocationEnabled'

// Testing-only: when on, every GPS read in the app (see lib/geo.ts) returns
// a simulated position instead of the real one, controlled from the debug
// panel on the round screen. Off by default, and never touched by normal
// play.
export function isDebugLocationEnabled(): boolean {
  return localStorage.getItem(DEBUG_LOCATION_KEY) === 'true'
}

export function setDebugLocationEnabled(enabled: boolean): void {
  localStorage.setItem(DEBUG_LOCATION_KEY, String(enabled))
}
