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

const BG_ANIMATION_KEY = 'fairway:bgAnimationEnabled'

// The slow-drifting background blobs (see index.css) are a nice-to-have —
// disabling them stops a continuously-animated blurred layer from
// recompositing every frame, which is the main lever a phone has here for
// battery life.
export function isBgAnimationEnabled(): boolean {
  const raw = localStorage.getItem(BG_ANIMATION_KEY)
  return raw === null ? true : raw === 'true'
}

export function applyBgAnimationClass(enabled: boolean): void {
  document.documentElement.classList.toggle('bg-animation-off', !enabled)
}

export function setBgAnimationEnabled(enabled: boolean): void {
  localStorage.setItem(BG_ANIMATION_KEY, String(enabled))
  applyBgAnimationClass(enabled)
}

const ONBOARDING_SEEN_KEY = 'fairway:onboardingSeen'

export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_SEEN_KEY) === 'true'
}

export function setOnboardingSeen(seen: boolean): void {
  localStorage.setItem(ONBOARDING_SEEN_KEY, String(seen))
}
