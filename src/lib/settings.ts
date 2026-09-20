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
