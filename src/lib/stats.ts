import { db } from '../db/db'
import type { HoleScore, Shot } from '../db/schema'

export interface RoundSummary {
  roundId: string
  courseId: string
  date: number
  totalStrokes: number
  totalPar: number
  toPar: number
}

export interface StatsSummary {
  roundsPlayed: number
  scoringAverage: number | null
  bestRound: RoundSummary | null
  fairwaysHitPct: number | null
  girPct: number | null
  puttsPerRound: number | null
  scramblingPct: number | null
  penaltiesPerRound: number | null
  penaltyBreakdown: Record<string, number>
  recentRounds: RoundSummary[]
}

export async function computeStats(): Promise<StatsSummary> {
  // `completed` isn't an indexed field, so filter in memory rather than query on it.
  const completedRounds = (await db.rounds.toArray()).filter((r) => r.completed)

  const summaries: RoundSummary[] = []
  let fairwayEligible = 0
  let fairwayHit = 0
  let girEligible = 0
  let girHit = 0
  let totalPutts = 0
  let puttRounds = 0
  let missedGirCount = 0
  let scrambledCount = 0
  let totalPenalties = 0
  const penaltyBreakdown: Record<string, number> = {}

  for (const round of completedRounds) {
    const holeScores: HoleScore[] = await db.holeScores.where('roundId').equals(round.id).toArray()
    if (holeScores.length === 0) continue

    const totalStrokes = holeScores.reduce((sum, h) => sum + h.strokes, 0)
    const totalPar = holeScores.reduce((sum, h) => sum + h.par, 0)
    summaries.push({
      roundId: round.id,
      courseId: round.courseId,
      date: round.date,
      totalStrokes,
      totalPar,
      toPar: totalStrokes - totalPar,
    })

    let roundPutts = 0
    for (const h of holeScores) {
      if (h.fairwayHit !== null) {
        fairwayEligible++
        if (h.fairwayHit) fairwayHit++
      }
      if (h.greenInRegulation !== null) {
        girEligible++
        if (h.greenInRegulation) girHit++
        if (!h.greenInRegulation) {
          missedGirCount++
          // Scrambling: missed green in regulation but still made par or better.
          if (h.strokes <= h.par) scrambledCount++
        }
      }
      roundPutts += h.putts
      totalPenalties += h.penalties.length
      for (const p of h.penalties) {
        penaltyBreakdown[p] = (penaltyBreakdown[p] ?? 0) + 1
      }
    }
    totalPutts += roundPutts
    puttRounds++
  }

  summaries.sort((a, b) => b.date - a.date)

  const scoringAverage =
    summaries.length > 0
      ? summaries.reduce((sum, s) => sum + s.totalStrokes, 0) / summaries.length
      : null

  const bestRound =
    summaries.length > 0
      ? summaries.reduce((best, s) => (s.toPar < best.toPar ? s : best), summaries[0])
      : null

  return {
    roundsPlayed: summaries.length,
    scoringAverage,
    bestRound,
    fairwaysHitPct: fairwayEligible > 0 ? (fairwayHit / fairwayEligible) * 100 : null,
    girPct: girEligible > 0 ? (girHit / girEligible) * 100 : null,
    puttsPerRound: puttRounds > 0 ? totalPutts / puttRounds : null,
    scramblingPct: missedGirCount > 0 ? (scrambledCount / missedGirCount) * 100 : null,
    penaltiesPerRound: puttRounds > 0 ? totalPenalties / puttRounds : null,
    penaltyBreakdown,
    recentRounds: summaries.slice(0, 10),
  }
}

export interface ClubStats {
  club: string
  shotCount: number
  avgYards: number
  minYards: number
  maxYards: number
}

// Self-sourced club distance calibration: derived entirely from the user's
// own GPS-tracked shots, no external data needed.
export async function computeClubDistances(): Promise<ClubStats[]> {
  const shots: Shot[] = await db.shots.toArray()
  const byClub = new Map<string, number[]>()

  for (const shot of shots) {
    if (!shot.club || !shot.distanceYardsFromPrev || shot.type === 'putt') continue
    if (shot.distanceYardsFromPrev < 20) continue // filter out noise/mis-marks
    const list = byClub.get(shot.club) ?? []
    list.push(shot.distanceYardsFromPrev)
    byClub.set(shot.club, list)
  }

  const results: ClubStats[] = []
  for (const [club, distances] of byClub) {
    results.push({
      club,
      shotCount: distances.length,
      avgYards: Math.round(distances.reduce((a, b) => a + b, 0) / distances.length),
      minYards: Math.round(Math.min(...distances)),
      maxYards: Math.round(Math.max(...distances)),
    })
  }

  return results.sort((a, b) => b.avgYards - a.avgYards)
}
