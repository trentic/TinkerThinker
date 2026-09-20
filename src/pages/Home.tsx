import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db, newId } from '../db/db'
import { BigButton } from '../components/BigButton'
import { Modal } from '../components/Modal'
import { daysSinceLastBackup } from '../db/backup'
import { checkCourseDeletable, deleteCourseCascade } from '../db/courseActions'
import { computeCourseSummary, type CourseSummary } from '../lib/courseStats'
import { isDebugLocationEnabled } from '../lib/settings'

type HoleSelection = 'all18' | 'front9' | 'back9'

const toParLabel = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : String(n))

export function Home() {
  const navigate = useNavigate()
  const allCourses = useLiveQuery(() => db.courses.orderBy('name').toArray(), [])
  const rounds = useLiveQuery(() => db.rounds.toArray(), [])
  const [query, setQuery] = useState('')
  const [pickingCourseId, setPickingCourseId] = useState<string | null>(null)
  const [pickingHolesFor, setPickingHolesFor] = useState<{ courseId: string; teeId: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleteBlockedReason, setDeleteBlockedReason] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [summaries, setSummaries] = useState<Record<string, CourseSummary>>({})
  const tees = useLiveQuery(
    () => (pickingCourseId ? db.tees.where('courseId').equals(pickingCourseId).sortBy('order') : []),
    [pickingCourseId],
  )
  const backupAge = daysSinceLastBackup()

  const courses = useMemo(() => {
    if (!allCourses) return allCourses
    const q = query.trim().toLowerCase()
    if (!q) return allCourses
    return allCourses.filter((c) => c.name.toLowerCase().includes(q))
  }, [allCourses, query])

  const resumeRound = useMemo(() => {
    const incomplete = (rounds ?? []).filter((r) => !r.completed)
    if (incomplete.length === 0) return null
    return incomplete.reduce((latest, r) => (r.date > latest.date ? r : latest), incomplete[0])
  }, [rounds])
  const resumeCourseName = allCourses?.find((c) => c.id === resumeRound?.courseId)?.name

  useEffect(() => {
    if (!allCourses) return
    ;(async () => {
      const entries = await Promise.all(
        allCourses.map(async (c) => [c.id, await computeCourseSummary(c.id)] as const),
      )
      setSummaries(Object.fromEntries(entries))
    })()
  }, [allCourses])

  async function startRound(courseId: string, teeId: string, holeNumbers: number[]) {
    const id = newId()
    await db.rounds.add({ id, courseId, teeId, date: Date.now(), completed: false, holeNumbers })
    navigate(`/round/${id}`)
  }

  function startPickingCourse(courseId: string) {
    setPickingCourseId(courseId)
    setPickingHolesFor(null)
  }

  function pickTee(course: { id: string; holeCount: 9 | 18 }, teeId: string) {
    if (course.holeCount === 18) {
      setPickingHolesFor({ courseId: course.id, teeId })
    } else {
      void startRound(course.id, teeId, Array.from({ length: course.holeCount }, (_, i) => i + 1))
    }
  }

  function pickHoles(courseId: string, teeId: string, selection: HoleSelection) {
    const holeNumbers =
      selection === 'all18'
        ? Array.from({ length: 18 }, (_, i) => i + 1)
        : selection === 'front9'
          ? Array.from({ length: 9 }, (_, i) => i + 1)
          : Array.from({ length: 9 }, (_, i) => i + 10)
    setPickingHolesFor(null)
    void startRound(courseId, teeId, holeNumbers)
  }

  async function requestDeleteCourse(course: { id: string; name: string }) {
    const check = await checkCourseDeletable(course.id)
    if (!check.canDelete) {
      setDeleteBlockedReason(check.reason ?? 'This course can\'t be deleted right now.')
      return
    }
    setDeleteTarget(course)
  }

  async function confirmDeleteCourse() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCourseCascade(deleteTarget.id)
      setDeleteTarget(null)
      if (pickingCourseId === deleteTarget.id) setPickingCourseId(null)
      if (pickingHolesFor?.courseId === deleteTarget.id) setPickingHolesFor(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-white mt-2">Fairway</h1>

      {isDebugLocationEnabled() && (
        <Link
          to="/settings"
          className="bg-amber-950/40 border border-amber-800 rounded-xl p-3 text-amber-200 text-sm"
        >
          🐛 Debug location is on — real rounds will use a simulated GPS position. Tap to turn it
          off in Settings.
        </Link>
      )}

      {resumeRound && (
        <Link
          to={`/round/${resumeRound.id}`}
          className="bg-green-900/40 border border-green-700 rounded-xl p-3 flex items-center justify-between"
        >
          <div>
            <div className="text-green-300 text-sm font-medium">Round in progress</div>
            <div className="text-white font-semibold">{resumeCourseName ?? 'Unknown course'}</div>
          </div>
          <span className="text-green-400 text-sm font-medium">Resume ›</span>
        </Link>
      )}

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

        {allCourses && allCourses.length > 3 && (
          <input
            className="bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-2.5 text-white text-sm"
            placeholder="Search courses"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}

        {allCourses?.length === 0 && (
          <p className="text-neutral-500 text-sm">
            No courses yet. Add one to start tracking rounds.
          </p>
        )}
        {allCourses && allCourses.length > 0 && courses?.length === 0 && (
          <p className="text-neutral-500 text-sm">No courses match "{query}".</p>
        )}

        {courses?.map((course) => {
          const summary = summaries[course.id]
          return (
            <div key={course.id} className="bg-neutral-900 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-white">{course.name}</div>
                  <div className="text-neutral-500 text-sm">{course.holeCount} holes</div>
                </div>
                <div className="flex gap-3 shrink-0 mt-1">
                  <Link to={`/courses/${course.id}/edit`} className="text-neutral-500 text-xs underline">
                    Edit
                  </Link>
                  <button
                    onClick={() => requestDeleteCourse(course)}
                    className="text-neutral-600 text-xs underline"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-neutral-500 text-xs">
                  {summary && summary.roundsPlayed > 0
                    ? `Played ${summary.roundsPlayed}x · avg ${toParLabel(Math.round(summary.avgToPar ?? 0))}${
                        summary.lastPlayedAt
                          ? ` · last ${new Date(summary.lastPlayedAt).toLocaleDateString()}`
                          : ''
                      }`
                    : 'Not played yet'}
                </p>
                <Link to={`/courses/${course.id}/preview`} className="text-green-500 text-xs underline shrink-0">
                  View scorecard
                </Link>
              </div>

              {pickingHolesFor?.courseId === course.id ? (
                <div className="flex flex-col gap-2">
                  <p className="text-neutral-400 text-sm">How many holes today?</p>
                  <div className="grid grid-cols-3 gap-2">
                    <BigButton onClick={() => pickHoles(course.id, pickingHolesFor.teeId, 'all18')}>
                      All 18
                    </BigButton>
                    <BigButton
                      variant="secondary"
                      onClick={() => pickHoles(course.id, pickingHolesFor.teeId, 'front9')}
                    >
                      Front 9
                    </BigButton>
                    <BigButton
                      variant="secondary"
                      onClick={() => pickHoles(course.id, pickingHolesFor.teeId, 'back9')}
                    >
                      Back 9
                    </BigButton>
                  </div>
                </div>
              ) : pickingCourseId === course.id ? (
                <div className="flex flex-wrap gap-2">
                  {tees?.map((tee) => (
                    <button
                      key={tee.id}
                      onClick={() => pickTee(course, tee.id)}
                      className="min-h-12 px-4 rounded-xl font-medium text-white"
                      style={{ backgroundColor: tee.color }}
                    >
                      {tee.name} tees
                    </button>
                  ))}
                  {tees?.length === 0 && (
                    <p className="text-neutral-500 text-sm">
                      No tee boxes set up yet —{' '}
                      <Link to={`/courses/${course.id}/edit`} className="underline">
                        add one
                      </Link>
                      .
                    </p>
                  )}
                </div>
              ) : (
                <BigButton variant="secondary" onClick={() => startPickingCourse(course.id)}>
                  Start round
                </BigButton>
              )}
            </div>
          )
        })}
      </div>

      {deleteTarget && (
        <Modal title={`Delete ${deleteTarget.name}?`} onClose={() => setDeleteTarget(null)}>
          <p className="text-neutral-400 text-sm mb-4">
            This removes the course and its tee boxes/hole map. Rounds and stats you already
            recorded there are kept.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <BigButton variant="danger" onClick={confirmDeleteCourse} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </BigButton>
            <BigButton variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </BigButton>
          </div>
        </Modal>
      )}

      {deleteBlockedReason && (
        <Modal title="Can't delete this course" onClose={() => setDeleteBlockedReason(null)}>
          <p className="text-neutral-400 text-sm mb-4">{deleteBlockedReason}</p>
          <BigButton onClick={() => setDeleteBlockedReason(null)}>Got it</BigButton>
        </Modal>
      )}
    </div>
  )
}
