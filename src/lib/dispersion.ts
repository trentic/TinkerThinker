import { db } from '../db/db'
import { bearingDeg, distanceYards, type LatLng } from './geo'
import type { Shot } from '../db/schema'
import { getCompletedRoundIds } from './completedRounds'

export interface ClubDispersion {
  club: string
  shotCount: number
  // Signed average lateral miss in yards: positive = right of target line,
  // negative = left. Target line is start-of-shot toward the hole's green
  // (or center, if no green has been captured yet) — an approximation of
  // "aiming at the hole", not the golfer's actual intended line on a dogleg.
  avgLateralYards: number
  tendency: 'straight' | 'left' | 'right'
}

/**
 * Approximates left/right shot dispersion per club from already-recorded
 * GPS shot positions — no new data entry required. For each full-swing
 * shot, compares the actual landing spot against the straight line from
 * where the shot was hit to the hole's green, using standard cross-track
 * distance.
 */
export async function computeClubDispersion(): Promise<ClubDispersion[]> {
  const [allShots, completedRoundIds] = await Promise.all([db.shots.toArray(), getCompletedRoundIds()])
  const swings = allShots.filter(
    (s) => completedRoundIds.has(s.roundId) && s.club && s.type !== 'putt' && s.type !== 'penalty',
  )
  if (swings.length === 0) return []

  const byHoleKey = new Map<string, Shot[]>()
  for (const s of swings) {
    const key = `${s.roundId}:${s.holeNumber}`
    const list = byHoleKey.get(key) ?? []
    list.push(s)
    byHoleKey.set(key, list)
  }

  // Cache round -> {courseId, teeId} since many shots share the same round.
  const roundCache = new Map<string, { courseId: string; teeId: string } | null>()

  const lateralByClub = new Map<string, number[]>()

  for (const [holeKey, holeShots] of byHoleKey) {
    const [roundId, holeNumberStr] = holeKey.split(':')
    const holeNumber = Number(holeNumberStr)

    let roundInfo = roundCache.get(roundId)
    if (roundInfo === undefined) {
      const round = await db.rounds.get(roundId)
      roundInfo = round ? { courseId: round.courseId, teeId: round.teeId } : null
      roundCache.set(roundId, roundInfo)
    }
    if (!roundInfo) continue

    const hole = await db.holes.where('[courseId+number]').equals([roundInfo.courseId, holeNumber]).first()
    if (!hole) continue
    const target: LatLng =
      hole.greenLat !== undefined && hole.greenLng !== undefined
        ? { lat: hole.greenLat, lng: hole.greenLng }
        : { lat: hole.centerLat, lng: hole.centerLng }

    holeShots.sort((a, b) => a.strokeNumber - b.strokeNumber)
    // The first shot starts from the tee, not from its own landing spot —
    // falls back to the hole's center if the tee position hasn't been
    // captured yet (no round has reached this hole's tee in-app).
    let start: LatLng = hole.teeCoords[roundInfo.teeId] ?? { lat: hole.centerLat, lng: hole.centerLng }
    for (const shot of holeShots) {
      const end: LatLng = { lat: shot.lat, lng: shot.lng }
      const startToEnd = distanceYards(start, end)
      if (startToEnd >= 20) {
        // Cross-track distance: how far the landing spot is from the
        // straight line start→target, positive meaning right of it.
        const bearingToTarget = bearingDeg(start, target)
        const bearingToEnd = bearingDeg(start, end)
        const angleDiff = (((bearingToEnd - bearingToTarget + 540) % 360) - 180) * (Math.PI / 180)
        const lateral = startToEnd * Math.sin(angleDiff)
        const list = lateralByClub.get(shot.club!) ?? []
        list.push(lateral)
        lateralByClub.set(shot.club!, list)
      }
      start = end
    }
  }

  const results: ClubDispersion[] = []
  for (const [club, laterals] of lateralByClub) {
    const avg = laterals.reduce((a, b) => a + b, 0) / laterals.length
    results.push({
      club,
      shotCount: laterals.length,
      avgLateralYards: Math.round(avg),
      tendency: Math.abs(avg) < 3 ? 'straight' : avg > 0 ? 'right' : 'left',
    })
  }
  return results.sort((a, b) => b.shotCount - a.shotCount)
}
