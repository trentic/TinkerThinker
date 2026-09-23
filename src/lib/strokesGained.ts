import { db } from '../db/db'
import { distanceYards } from './geo'
import type { TeeShotLie } from '../db/schema'

// Approximate baselines (expected strokes to hole out), loosely modeled on
// published strokes-gained research but hand-simplified — not official PGA
// Tour ShotLink data. Distances in yards.
type Baseline = [distanceYards: number, expectedStrokes: number][]

const TEE_BASELINE: Baseline = [
  [100, 2.8],
  [150, 2.9],
  [200, 3.0],
  [250, 3.4],
  [300, 3.8],
  [350, 4.0],
  [400, 4.2],
  [450, 4.4],
  [500, 4.6],
  [550, 4.8],
  [600, 5.0],
]

const APPROACH_BASELINE: Record<TeeShotLie, Baseline> = {
  fairway: [
    [0, 2.2],
    [20, 2.4],
    [50, 2.6],
    [100, 2.8],
    [150, 2.9],
    [200, 3.1],
    [250, 3.4],
  ],
  rough: [
    [0, 2.3],
    [20, 2.6],
    [50, 2.8],
    [100, 3.0],
    [150, 3.1],
    [200, 3.3],
    [250, 3.6],
  ],
  sand: [
    [0, 2.4],
    [20, 2.8],
    [50, 3.0],
    [100, 3.2],
    [150, 3.3],
    [200, 3.5],
    [250, 3.8],
  ],
}

function interpolate(table: Baseline, distance: number): number {
  if (distance <= table[0][0]) return table[0][1]
  const last = table[table.length - 1]
  if (distance >= last[0]) return last[1]
  for (let i = 0; i < table.length - 1; i++) {
    const [d0, e0] = table[i]
    const [d1, e1] = table[i + 1]
    if (distance >= d0 && distance <= d1) {
      const t = (distance - d0) / (d1 - d0)
      return e0 + t * (e1 - e0)
    }
  }
  return last[1]
}

export interface StrokesGainedSummary {
  avgSgOffTee: number | null
  shotCount: number
  byClub: Record<string, { avg: number; count: number }>
}

/**
 * Simplified "Strokes Gained: Off the Tee" for par-4/5 tee shots, using an
 * approximate baseline table and each tee shot's recorded fairway/rough/
 * sand result (see db/schema.ts's teeShotLie). Nothing else is covered —
 * approach-shot lie and putt distance aren't tracked per-shot in this app,
 * so a full Strokes Gained breakdown (off-the-tee + approach + short game +
 * putting) isn't possible with the data collected today. Treat this as a
 * rough estimate, not an official number.
 */
export async function computeStrokesGainedOffTee(): Promise<StrokesGainedSummary> {
  const scores = await db.holeScores.toArray()
  const eligible = scores.filter((s) => s.teeShotLie !== null && s.par >= 4)
  if (eligible.length === 0) return { avgSgOffTee: null, shotCount: 0, byClub: {} }

  const results: number[] = []
  const byClub = new Map<string, number[]>()

  for (const score of eligible) {
    const round = await db.rounds.get(score.roundId)
    if (!round) continue
    const hole = await db.holes.where('[courseId+number]').equals([round.courseId, score.holeNumber]).first()
    if (!hole) continue
    const teeYardage = hole.yardageByTee[round.teeId]
    if (!teeYardage) continue

    const holeShots = await db.shots.where('[roundId+holeNumber]').equals([score.roundId, score.holeNumber]).toArray()
    const teeShot = holeShots.filter((s) => s.type === 'tee').sort((a, b) => a.strokeNumber - b.strokeNumber)[0]
    if (!teeShot) continue

    const green =
      hole.greenLat !== undefined && hole.greenLng !== undefined
        ? { lat: hole.greenLat, lng: hole.greenLng }
        : { lat: hole.centerLat, lng: hole.centerLng }
    const distanceAfter = distanceYards({ lat: teeShot.lat, lng: teeShot.lng }, green)

    const expectedBefore = interpolate(TEE_BASELINE, teeYardage)
    const expectedAfter = interpolate(APPROACH_BASELINE[score.teeShotLie!], distanceAfter)
    const sg = expectedBefore - expectedAfter - 1

    results.push(sg)
    if (teeShot.club) {
      const list = byClub.get(teeShot.club) ?? []
      list.push(sg)
      byClub.set(teeShot.club, list)
    }
  }

  if (results.length === 0) return { avgSgOffTee: null, shotCount: 0, byClub: {} }

  const byClubSummary: Record<string, { avg: number; count: number }> = {}
  for (const [club, vals] of byClub) {
    byClubSummary[club] = {
      avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
      count: vals.length,
    }
  }

  return {
    avgSgOffTee: Math.round((results.reduce((a, b) => a + b, 0) / results.length) * 100) / 100,
    shotCount: results.length,
    byClub: byClubSummary,
  }
}
