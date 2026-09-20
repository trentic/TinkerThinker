import { db } from '../db/db'

export interface CourseSummary {
  roundsPlayed: number
  avgToPar: number | null
  bestToPar: number | null
  lastPlayedAt: number | null
}

export async function computeCourseSummary(courseId: string): Promise<CourseSummary> {
  const rounds = (await db.rounds.where('courseId').equals(courseId).toArray()).filter(
    (r) => r.completed,
  )

  if (rounds.length === 0) {
    return { roundsPlayed: 0, avgToPar: null, bestToPar: null, lastPlayedAt: null }
  }

  const toPars: number[] = []
  let lastPlayedAt = 0
  for (const round of rounds) {
    const holeScores = await db.holeScores.where('roundId').equals(round.id).toArray()
    if (holeScores.length === 0) continue
    const strokes = holeScores.reduce((sum, h) => sum + h.strokes, 0)
    const par = holeScores.reduce((sum, h) => sum + h.par, 0)
    toPars.push(strokes - par)
    lastPlayedAt = Math.max(lastPlayedAt, round.date)
  }

  if (toPars.length === 0) {
    return { roundsPlayed: 0, avgToPar: null, bestToPar: null, lastPlayedAt: null }
  }

  return {
    roundsPlayed: toPars.length,
    avgToPar: toPars.reduce((a, b) => a + b, 0) / toPars.length,
    bestToPar: Math.min(...toPars),
    lastPlayedAt,
  }
}
