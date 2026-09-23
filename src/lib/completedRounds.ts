import { db } from '../db/db'

// A round that hasn't been finished (or was abandoned) isn't a real result
// yet — every stat computed from shots/hole scores should trace back to a
// completed round, the same rule computeStats/computeCourseSummary/
// computeHandicapIndex already apply to rounds directly.
export async function getCompletedRoundIds(): Promise<Set<string>> {
  const rounds = await db.rounds.toArray()
  return new Set(rounds.filter((r) => r.completed).map((r) => r.id))
}
