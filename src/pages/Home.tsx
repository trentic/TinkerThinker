import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, newId } from '../db/db'
import { BigButton } from '../components/BigButton'
import { daysSinceLastBackup } from '../db/backup'

export function Home() {
  const navigate = useNavigate()
  const courses = useLiveQuery(() => db.courses.orderBy('name').toArray(), [])
  const [pickingCourseId, setPickingCourseId] = useState<string | null>(null)
  const tees = useLiveQuery(
    () => (pickingCourseId ? db.tees.where('courseId').equals(pickingCourseId).sortBy('order') : []),
    [pickingCourseId],
  )
  const backupAge = daysSinceLastBackup()

  async function startRound(courseId: string, teeId: string) {
    const id = newId()
    await db.rounds.add({ id, courseId, teeId, date: Date.now(), completed: false })
    navigate(`/round/${id}`)
  }

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-white mt-2">Fairway</h1>

      {backupAge !== null && backupAge >= 14 && (
        <div className="bg-amber-900/40 border border-amber-700 text-amber-200 text-sm rounded-xl p-3">
          It's been {backupAge} days since your last backup. Your rounds only live on this
          device —{' '}
          <a href="#/settings" className="underline font-medium">
            back them up
          </a>
          .
        </div>
      )}

      <BigButton onClick={() => navigate('/courses/new')} className="w-full">
        + Add a course
      </BigButton>

      <div className="flex flex-col gap-2">
        <h2 className="text-neutral-400 text-sm font-semibold uppercase tracking-wide">
          Your courses
        </h2>
        {courses?.length === 0 && (
          <p className="text-neutral-500 text-sm">
            No courses yet. Add one to start tracking rounds.
          </p>
        )}
        {courses?.map((course) => (
          <div key={course.id} className="bg-neutral-900 rounded-2xl p-4 flex flex-col gap-3">
            <div>
              <div className="font-semibold text-white">{course.name}</div>
              <div className="text-neutral-500 text-sm">{course.holeCount} holes</div>
            </div>
            {pickingCourseId === course.id ? (
              <div className="flex flex-wrap gap-2">
                {tees?.map((tee) => (
                  <button
                    key={tee.id}
                    onClick={() => startRound(course.id, tee.id)}
                    className="min-h-12 px-4 rounded-xl font-medium text-white"
                    style={{ backgroundColor: tee.color }}
                  >
                    {tee.name} tees
                  </button>
                ))}
                {tees?.length === 0 && (
                  <p className="text-neutral-500 text-sm">
                    No tee boxes set up yet — edit this course to add one.
                  </p>
                )}
              </div>
            ) : (
              <BigButton variant="secondary" onClick={() => setPickingCourseId(course.id)}>
                Start round
              </BigButton>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
