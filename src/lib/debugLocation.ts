// Testing-only mock GPS. When debug mode (Settings) is on, getCurrentPosition()
// in lib/geo.ts returns this simulated position transparently, so every
// existing GPS call site in the app — round tracking, course building —
// works unmodified. The round screen's debug panel is the only thing that
// writes to it.

import type { LatLng } from './geo'
import { isDebugLocationEnabled } from './settings'

const MOCK_POSITION_KEY = 'fairway:mockPosition'
const CHANGE_EVENT = 'fairway:mockPositionChanged'

export function getMockPosition(): LatLng | null {
  const raw = localStorage.getItem(MOCK_POSITION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as LatLng
  } catch {
    return null
  }
}

export function setMockPosition(pos: LatLng): void {
  localStorage.setItem(MOCK_POSITION_KEY, JSON.stringify(pos))
  window.dispatchEvent(new CustomEvent<LatLng>(CHANGE_EVENT, { detail: pos }))
}

export function onMockPositionChange(callback: (pos: LatLng) => void): () => void {
  const handler = (e: Event) => callback((e as CustomEvent<LatLng>).detail)
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}

/** Only used by lib/geo.ts's getCurrentPosition(). */
export function readMockPositionIfDebugging(): LatLng | null {
  if (!isDebugLocationEnabled()) return null
  return getMockPosition()
}
