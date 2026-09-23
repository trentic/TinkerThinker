import { db } from '../db/db'

// Simplified World Handicap System (WHS) approximation. Real WHS also
// applies a Playing Conditions Calculation and a net-double-bogey cap per
// hole before totaling strokes — both skipped here for simplicity, so this
// is an estimate, not an official Handicap Index. Only counts full 18-hole
// rounds (9-hole combining has its own WHS rules, not implemented).
const DIFFERENTIALS_TO_USE: [maxRounds: number, useCount: number][] = [
  [3, 1],
  [5, 1],
  [6, 2],
  [8, 2],
  [9, 3],
  [11, 3],
  [12, 4],
  [14, 4],
  [15, 5],
  [16, 5],
  [17, 6],
  [18, 6],
  [19, 7],
  [20, 8],
]

function countToUse(n: number): number {
  for (const [maxRounds, count] of DIFFERENTIALS_TO_USE) {
    if (n <= maxRounds) return count
  }
  return 8
}

export interface HandicapResult {
  index: number
  roundsUsed: number
  roundsAvailable: number
}

export async function computeHandicapIndex(): Promise<HandicapResult | null> {
  const rounds = (await db.rounds.toArray())
    .filter((r) => r.completed)
    .sort((a, b) => b.date - a.date)
    .slice(0, 20)

  const differentials: number[] = []
  for (const round of rounds) {
    const tee = await db.tees.get(round.teeId)
    if (!tee?.courseRating || !tee?.slopeRating) continue

    const scores = await db.holeScores.where('roundId').equals(round.id).toArray()
    if (scores.length < 18) continue // only full 18-hole rounds

    const totalStrokes = scores.reduce((sum, h) => sum + h.strokes, 0)
    differentials.push((113 / tee.slopeRating) * (totalStrokes - tee.courseRating))
  }

  if (differentials.length === 0) return null

  differentials.sort((a, b) => a - b)
  const useCount = countToUse(differentials.length)
  const used = differentials.slice(0, useCount)
  const avg = used.reduce((a, b) => a + b, 0) / used.length

  return {
    index: Math.round(avg * 0.96 * 10) / 10,
    roundsUsed: used.length,
    roundsAvailable: differentials.length,
  }
}
