import { db } from '../db/db'
import type { HoleScore, TeeShotLie } from '../db/schema'
import { getCompletedRoundIds } from './completedRounds'

export interface RoundSummary {
  roundId: string
  courseId: string
  date: number
  holesPlayed: number
  totalStrokes: number
  totalPar: number
  toPar: number
}

export interface StatsSummary {
  roundsPlayed: number
  avgToPar: number | null
  bestRound: RoundSummary | null
  fairwaysHitPct: number | null
  lieBreakdown: Record<TeeShotLie, number>
  girPct: number | null
  puttsPer9: number | null
  scramblingPct: number | null
  penaltiesPer9: number | null
  penaltyBreakdown: Record<string, number>
  recentRounds: RoundSummary[]
}

export async function computeStats(): Promise<StatsSummary> {
  // `completed` isn't an indexed field, so filter in memory rather than query on it.
  const completedRounds = (await db.rounds.toArray()).filter((r) => r.completed)

  const summaries: RoundSummary[] = []
  let fairwayEligible = 0
  const lieBreakdown: Record<TeeShotLie, number> = { fairway: 0, rough: 0, sand: 0 }
  let girEligible = 0
  let girHit = 0
  let missedGirCount = 0
  let scrambledCount = 0
  const penaltyBreakdown: Record<string, number> = {}
  // Per-round rates normalized to "per 9 holes" so a front-9 round and an
  // 18-hole round don't get blended unfairly into the same raw average.
  const puttRatesPer9: number[] = []
  const penaltyRatesPer9: number[] = []

  for (const round of completedRounds) {
    const holeScores: HoleScore[] = await db.holeScores.where('roundId').equals(round.id).toArray()
    if (holeScores.length === 0) continue

    const totalStrokes = holeScores.reduce((sum, h) => sum + h.strokes, 0)
    const totalPar = holeScores.reduce((sum, h) => sum + h.par, 0)
    summaries.push({
      roundId: round.id,
      courseId: round.courseId,
      date: round.date,
      holesPlayed: holeScores.length,
      totalStrokes,
      totalPar,
      toPar: totalStrokes - totalPar,
    })

    let roundPutts = 0
    let roundPenalties = 0
    for (const h of holeScores) {
      if (h.teeShotLie !== null) {
        fairwayEligible++
        lieBreakdown[h.teeShotLie]++
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
      roundPenalties += h.penalties.length
      for (const p of h.penalties) {
        penaltyBreakdown[p] = (penaltyBreakdown[p] ?? 0) + 1
      }
    }
    puttRatesPer9.push((roundPutts / holeScores.length) * 9)
    penaltyRatesPer9.push((roundPenalties / holeScores.length) * 9)
  }

  summaries.sort((a, b) => b.date - a.date)

  const avg = (nums: number[]) => (nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null)

  const avgToPar = avg(summaries.map((s) => s.toPar))

  const bestRound =
    summaries.length > 0
      ? summaries.reduce((best, s) => (s.toPar < best.toPar ? s : best), summaries[0])
      : null

  return {
    roundsPlayed: summaries.length,
    avgToPar,
    bestRound,
    fairwaysHitPct: fairwayEligible > 0 ? (lieBreakdown.fairway / fairwayEligible) * 100 : null,
    lieBreakdown,
    girPct: girEligible > 0 ? (girHit / girEligible) * 100 : null,
    puttsPer9: avg(puttRatesPer9),
    scramblingPct: missedGirCount > 0 ? (scrambledCount / missedGirCount) * 100 : null,
    penaltiesPer9: avg(penaltyRatesPer9),
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
  isSelfReported: boolean // true = no GPS shots yet, showing the manually entered yardage
}

// Self-sourced club distance calibration: derived from the user's own
// GPS-tracked shots. Clubs with no shots yet fall back to whatever yardage
// the user typed into their bag in Settings (TrackMan-style seed value),
// clearly marked as self-reported rather than measured.
export async function computeClubDistances(): Promise<ClubStats[]> {
  const [shots, bagClubs, completedRoundIds] = await Promise.all([
    db.shots.toArray(),
    db.bagClubs.toArray(),
    getCompletedRoundIds(),
  ])
  const byClub = new Map<string, number[]>()

  for (const shot of shots) {
    if (!completedRoundIds.has(shot.roundId)) continue
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
      isSelfReported: false,
    })
  }

  for (const bagClub of bagClubs) {
    if (!bagClub.inBag || !bagClub.manualYardage || byClub.has(bagClub.club)) continue
    results.push({
      club: bagClub.club,
      shotCount: 0,
      avgYards: bagClub.manualYardage,
      minYards: bagClub.manualYardage,
      maxYards: bagClub.manualYardage,
      isSelfReported: true,
    })
  }

  return results.sort((a, b) => b.avgYards - a.avgYards)
}
