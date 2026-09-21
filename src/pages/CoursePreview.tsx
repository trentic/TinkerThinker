import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db, newId } from '../db/db'
import type { Hole } from '../db/schema'
import { BigButton } from '../components/BigButton'
import { computeCourseSummary } from '../lib/courseStats'
import { toParLabel } from '../lib/format'

export function CoursePreview() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  // Live (not a one-shot effect) so this refreshes automatically after any
  // data change — including a Google Drive pull or local backup restore,
  // which write straight to IndexedDB without navigating here.
  const data = useLiveQuery(async () => {
    if (!courseId) return null
    const [course, tees, holes, summary] = await Promise.all([
      db.courses.get(courseId),
      db.tees.where('courseId').equals(courseId).sortBy('order'),
      db.holes.where('courseId').equals(courseId).sortBy('number'),
      computeCourseSummary(courseId),
    ])
    return { course: course ?? null, tees, holes, summary }
  }, [courseId])
  // null means "no explicit pick yet" — defaults to the first tee below,
  // derived at render rather than synced via an effect.
  const [pickedTeeId, setPickedTeeId] = useState<string | null>(null)
  const [pickingHoles, setPickingHoles] = useState(false)

  const course = data?.course ?? null
  const tees = data?.tees ?? []
  const holes = data?.holes ?? []
  const summary = data?.summary ?? null
  const selectedTeeId = pickedTeeId ?? tees[0]?.id ?? null

  async function startRound(holeNumbers: number[]) {
    if (!course || !selectedTeeId) return
    const id = newId()
    await db.rounds.add({
      id,
      courseId: course.id,
      teeId: selectedTeeId,
      date: Date.now(),
      completed: false,
      holeNumbers,
    })
    navigate(`/round/${id}`)
  }

  if (!course)
    return (
      <div className="p-4" style={{ color: 'var(--ink-muted)' }}>
        Loading…
      </div>
    )

  const front = holes.filter((h) => h.number <= 9)
  const back = holes.filter((h) => h.number > 9)
  const yardageTotal = (list: Hole[]) =>
    selectedTeeId ? list.reduce((sum, h) => sum + (h.yardageByTee[selectedTeeId] ?? 0), 0) : 0
  const parTotal = (list: Hole[]) => list.reduce((sum, h) => sum + h.par, 0)
  const muted = { color: 'var(--ink-muted)' }
  const ink = { color: 'var(--ink)' }

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4 pb-24">
      <div>
        <h1 className="text-2xl font-bold mt-2" style={ink}>
          {course.name}
        </h1>
        <p className="text-sm" style={muted}>
          {course.holeCount} holes
        </p>
      </div>

      {summary && summary.roundsPlayed > 0 && (
        <div className="glass rounded-2xl p-4 flex justify-between text-sm">
          <div>
            <div style={muted}>Rounds here</div>
            <div className="font-semibold" style={ink}>
              {summary.roundsPlayed}
            </div>
          </div>
          <div>
            <div style={muted}>Avg to par</div>
            <div className="font-semibold" style={ink}>
              {toParLabel(Math.round(summary.avgToPar ?? 0))}
            </div>
          </div>
          <div>
            <div style={muted}>Best</div>
            <div className="font-semibold" style={ink}>
              {toParLabel(summary.bestToPar ?? 0)}
            </div>
          </div>
          <div>
            <div style={muted}>Last played</div>
            <div className="font-semibold" style={ink}>
              {summary.lastPlayedAt ? new Date(summary.lastPlayedAt).toLocaleDateString() : '—'}
            </div>
          </div>
        </div>
      )}

      {tees.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {tees.map((t) => (
            <button
              key={t.id}
              onClick={() => setPickedTeeId(t.id)}
              className="min-h-10 px-4 rounded-lg text-sm font-medium"
              style={
                selectedTeeId === t.id
                  ? { backgroundColor: t.color, color: '#ffffff' }
                  : { background: 'rgba(255,255,255,0.5)', color: 'var(--ink-muted)' }
              }
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {[front, back].map((half, i) =>
        half.length > 0 ? (
          <div key={i} className="overflow-x-auto">
            <table className="w-full text-center text-sm">
              <thead>
                <tr style={muted}>
                  <th className="text-left font-normal pl-1">Hole</th>
                  {half.map((h) => (
                    <td key={h.number}>{h.number}</td>
                  ))}
                  <td className="font-semibold">{i === 0 ? 'OUT' : 'IN'}</td>
                </tr>
              </thead>
              <tbody>
                <tr style={ink}>
                  <th className="text-left font-normal pl-1" style={muted}>
                    Par
                  </th>
                  {half.map((h) => (
                    <td key={h.number}>{h.par}</td>
                  ))}
                  <td className="font-semibold">{parTotal(half)}</td>
                </tr>
                <tr style={{ color: 'var(--ink-secondary)' }}>
                  <th className="text-left font-normal pl-1">Yards</th>
                  {half.map((h) => (
                    <td key={h.number}>{selectedTeeId ? (h.yardageByTee[selectedTeeId] ?? '—') : '—'}</td>
                  ))}
                  <td>{yardageTotal(half) || '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null,
      )}

      {!pickingHoles ? (
        <BigButton
          onClick={() => {
            if (course.holeCount === 18) setPickingHoles(true)
            else void startRound(Array.from({ length: course.holeCount }, (_, i) => i + 1))
          }}
          disabled={!selectedTeeId}
        >
          Start round here
        </BigButton>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm" style={{ color: 'var(--ink-secondary)' }}>
            How many holes today?
          </p>
          <div className="grid grid-cols-3 gap-2">
            <BigButton onClick={() => startRound(Array.from({ length: 18 }, (_, i) => i + 1))}>
              All 18
            </BigButton>
            <BigButton
              variant="secondary"
              onClick={() => startRound(Array.from({ length: 9 }, (_, i) => i + 1))}
            >
              Front 9
            </BigButton>
            <BigButton
              variant="secondary"
              onClick={() => startRound(Array.from({ length: 9 }, (_, i) => i + 10))}
            >
              Back 9
            </BigButton>
          </div>
        </div>
      )}
    </div>
  )
}
