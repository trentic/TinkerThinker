// "Par 3 Mode" — play anywhere without mapping a course first. Every hole is
// a generic par 3, and the round is backed by a single standing "freeform"
// Course + Tee (created once, reused for every quick round after) so scores
// still flow through the normal Round/HoleScore/Stats pipeline.
import { db, newId } from '../db/db'
import { getCurrentPosition } from './geo'
import type { Course, Hole, Tee } from '../db/schema'

const FREEFORM_HOLE_COUNT = 18

async function getOrCreateFreeformCourse(centerLat: number, centerLng: number): Promise<{ course: Course; tee: Tee }> {
  const existingCourse = await db.courses.toCollection().filter((c) => !!c.freeform).first()
  if (existingCourse) {
    const existingTee = await db.tees.where('courseId').equals(existingCourse.id).first()
    if (existingTee) return { course: existingCourse, tee: existingTee }
  }

  const course: Course = {
    id: newId(),
    name: 'Par 3 Mode',
    centerLat,
    centerLng,
    holeCount: 18,
    source: 'manual',
    freeform: true,
    createdAt: Date.now(),
  }
  const tee: Tee = { id: newId(), courseId: course.id, name: 'Par 3', color: '#22c55e', order: 0 }
  const holes: Hole[] = Array.from({ length: FREEFORM_HOLE_COUNT }, (_, i) => ({
    id: newId(),
    courseId: course.id,
    number: i + 1,
    par: 3,
    centerLat,
    centerLng,
    teeCoords: {},
    yardageByTee: {},
  }))
  await db.courses.add(course)
  await db.tees.add(tee)
  await db.holes.bulkAdd(holes)
  return { course, tee }
}

// Throws if location access fails/is denied — callers should surface that,
// same as every other GPS-dependent flow in the app.
export async function startParThreeRound(holeCount: 3 | 9 | 18): Promise<string> {
  const pos = await getCurrentPosition()
  const { course, tee } = await getOrCreateFreeformCourse(pos.coords.latitude, pos.coords.longitude)
  const id = newId()
  await db.rounds.add({
    id,
    courseId: course.id,
    teeId: tee.id,
    date: Date.now(),
    completed: false,
    holeNumbers: Array.from({ length: holeCount }, (_, i) => i + 1),
  })
  return id
}
