import { db } from './db'

export interface DeleteCourseCheck {
  canDelete: boolean
  reason?: string
}

/** Blocks deleting a course out from under a round that's still being played. */
export async function checkCourseDeletable(courseId: string): Promise<DeleteCourseCheck> {
  const rounds = await db.rounds.where('courseId').equals(courseId).toArray()
  const inProgress = rounds.some((r) => !r.completed)
  if (inProgress) {
    return {
      canDelete: false,
      reason: 'There\'s a round in progress at this course. Finish or leave it before deleting the course.',
    }
  }
  return { canDelete: true }
}

/**
 * Deletes a course along with its tees and holes. Deliberately leaves
 * completed rounds/scores/shots alone — course history is worth keeping
 * even after you stop tracking a course, and every place that displays a
 * round already handles a missing course/tee gracefully.
 */
export async function deleteCourseCascade(courseId: string): Promise<void> {
  await db.transaction('rw', [db.courses, db.tees, db.holes], async () => {
    await db.courses.delete(courseId)
    await db.tees.where('courseId').equals(courseId).delete()
    await db.holes.where('courseId').equals(courseId).delete()
  })
}
