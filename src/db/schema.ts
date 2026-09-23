// Local-first data model. Every table lives in IndexedDB on this device only.
// Nothing here talks to a server — see backup.ts for the export/import path
// that lets data survive a device reset.

export type CourseSource = 'osm' | 'manual' | 'mixed'

export interface Course {
  id: string
  name: string
  city?: string
  centerLat: number
  centerLng: number
  holeCount: 9 | 18
  source: CourseSource
  createdAt: number
  // Par 3 Mode's own standing course record — 18 generic par-3 "holes"
  // with no fixed real-world layout, reused across every quick round
  // instead of requiring a mapped course. Hidden from the normal course
  // list; see lib/parThreeMode.ts.
  freeform?: boolean
}

export interface Tee {
  id: string
  courseId: string
  name: string // e.g. "Blue", "White", "Red"
  color: string // hex, for map/UI badges
  order: number
  // Optional: only present if the user typed it in off a scorecard.
  // Never computed or assumed by the app.
  courseRating?: number
  slopeRating?: number
}

export interface Hole {
  id: string
  courseId: string
  number: number // 1..18
  par: number
  strokeIndex?: number // handicap stroke index off the scorecard, optional
  // Rough center, captured during the tap-through course-builder step.
  centerLat: number
  centerLng: number
  // Only present when OpenStreetMap had a complete, numbered hole outline
  // to auto-map from — never fabricated for a manually-tapped hole.
  outline?: { lat: number; lng: number }[]
  // Precise tee/green coordinates, filled in progressively the first time
  // a user actually plays the hole (see round flow). Keyed by Tee.id.
  teeCoords: Record<string, { lat: number; lng: number }>
  greenLat?: number
  greenLng?: number
  // Yardage per tee, from OCR import or derived from teeCoords/green once known.
  yardageByTee: Record<string, number>
}

export type PenaltyType = 'water' | 'oob' | 'lost' | 'unplayable'

export type TeeShotLie = 'fairway' | 'rough' | 'sand'

export interface Round {
  id: string
  courseId: string
  teeId: string
  date: number
  completed: boolean
  // Which hole numbers this round covers, in play order — e.g. all 18,
  // just the front 9 ([1..9]), or just the back 9 ([10..18]). A course's
  // own holeCount is how many holes physically exist there; this is what
  // you're actually playing today.
  holeNumbers: number[]
  // Today's pin position per hole, captured by tapping the flag on the map
  // — distinct from Hole.greenLat/Lng (the course's permanent green-center
  // reference), since the actual cup moves day to day. Optional/progressive,
  // same pattern as Hole.teeCoords.
  pinPositions?: Record<number, { lat: number; lng: number }>
}

export interface HoleScore {
  id: string
  roundId: string
  holeNumber: number
  par: number
  strokes: number
  putts: number
  penalties: PenaltyType[]
  teeShotLie: TeeShotLie | null // null = not applicable (par 3, or no tee shot recorded yet)
  greenInRegulation: boolean | null
}

export interface BagClub {
  club: string // primary key, matches an entry in lib/clubs.ts
  inBag: boolean
  // Self-reported "I know I hit this X yards" — a TrackMan-style seed value
  // shown until real GPS-derived shot data takes over.
  manualYardage?: number
}

export type ShotType = 'tee' | 'approach' | 'putt' | 'penalty'

export interface Shot {
  id: string
  roundId: string
  holeNumber: number
  strokeNumber: number
  lat: number
  lng: number
  type: ShotType
  penaltyType?: PenaltyType
  club?: string
  distanceYardsFromPrev?: number
  timestamp: number
}
