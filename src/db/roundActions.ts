import { db } from './db'

/**
 * Deletes an in-progress (or otherwise unwanted) round along with its hole
 * scores and shots. A round that was never marked `completed` was never
 * counted in any stat (see lib/completedRounds.ts), so deleting it changes
 * nothing there — this just clears it out of view.
 */
export async function deleteRound(roundId: string): Promise<void> {
  await db.transaction('rw', [db.rounds, db.holeScores, db.shots], async () => {
    await db.rounds.delete(roundId)
    await db.holeScores.where('roundId').equals(roundId).delete()
    await db.shots.where('roundId').equals(roundId).delete()
  })
}
