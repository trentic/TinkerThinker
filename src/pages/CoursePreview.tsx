import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, newId } from '../db/db'
import type { Course, Hole, Tee } from '../db/schema'
import { BigButton } from '../components/BigButton'
import { computeCourseSummary, type CourseSummary } from '../lib/courseStats'
import { toParLabel } from '../lib/format'

export function CoursePreview() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const [course, setCourse] = useState<Course | null>(null)
  const [tees, setTees] = useState<Tee[]>([])
  const [holes, setHoles] = useState<Hole[]>([])
  const [summary, setSummary] = useState<CourseSummary | null>(null)
  const [selectedTeeId, setSelectedTeeId] = useState<string | null>(null)
  const [pickingHoles, setPickingHoles] = useState(false)

  useEffect(() => {
    if (!courseId) return
    ;(async () => {
      const [c, t, h, s] = await Promise.all([
        db.courses.get(courseId),
        db.tees.where('courseId').equals(courseId).sortBy('order'),
        db.holes.where('courseId').equals(courseId).sortBy('number'),
        computeCourseSummary(courseId),
      ])
      setCourse(c ?? null)
      setTees(t)
      setHoles(h)
      setSummary(s)
      setSelectedTeeId(t[0]?.id ?? null)
    })()
  }, [courseId])

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

  if (!course) return <div className="p-4 text-neutral-500">Loading…</div>

  const front = holes.filter((h) => h.number <= 9)
  const back = holes.filter((h) => h.number > 9)
  const yardageTotal = (list: Hole[]) =>
    selectedTeeId ? list.reduce((sum, h) => sum + (h.yardageByTee[selectedTeeId] ?? 0), 0) : 0
  const parTotal = (list: Hole[]) => list.reduce((sum, h) => sum + h.par, 0)

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-white mt-2">{course.name}</h1>
        <p className="text-neutral-500 text-sm">{course.holeCount} holes</p>
      </div>

      {summary && summary.roundsPlayed > 0 && (
        <div className="bg-neutral-900 rounded-2xl p-4 flex justify-between text-sm">
          <div>
            <div className="text-neutral-500">Rounds here</div>
            <div className="text-white font-semibold">{summary.roundsPlayed}</div>
          </div>
          <div>
            <div className="text-neutral-500">Avg to par</div>
            <div className="text-white font-semibold">{toParLabel(Math.round(summary.avgToPar ?? 0))}</div>
          </div>
          <div>
            <div className="text-neutral-500">Best</div>
            <div className="text-white font-semibold">{toParLabel(summary.bestToPar ?? 0)}</div>
          </div>
          <div>
            <div className="text-neutral-500">Last played</div>
            <div className="text-white font-semibold">
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
              onClick={() => setSelectedTeeId(t.id)}
              className={`min-h-10 px-4 rounded-lg text-sm font-medium ${
                selectedTeeId === t.id ? 'text-white' : 'bg-neutral-800 text-neutral-400'
              }`}
              style={selectedTeeId === t.id ? { backgroundColor: t.color } : undefined}
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
                <tr className="text-neutral-500">
                  <th className="text-left font-normal pl-1">Hole</th>
                  {half.map((h) => (
                    <td key={h.number}>{h.number}</td>
                  ))}
                  <td className="font-semibold">{i === 0 ? 'OUT' : 'IN'}</td>
                </tr>
              </thead>
              <tbody>
                <tr className="text-white">
                  <th className="text-left font-normal pl-1 text-neutral-500">Par</th>
                  {half.map((h) => (
                    <td key={h.number}>{h.par}</td>
                  ))}
                  <td className="font-semibold">{parTotal(half)}</td>
                </tr>
                <tr className="text-neutral-400">
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
          <p className="text-neutral-400 text-sm">How many holes today?</p>
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
