import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { db } from '../db/db'
import type { Course, HoleScore, Round, Tee } from '../db/schema'
import { HoleScoreTable } from '../components/HoleScoreTable'

export function Scorecard() {
  const { roundId } = useParams<{ roundId: string }>()
  const [round, setRound] = useState<Round | null>(null)
  const [course, setCourse] = useState<Course | null>(null)
  const [tee, setTee] = useState<Tee | null>(null)
  const [scores, setScores] = useState<HoleScore[]>([])

  useEffect(() => {
    if (!roundId) return
    ;(async () => {
      const r = await db.rounds.get(roundId)
      if (!r) return
      setRound(r)
      const [c, t, s] = await Promise.all([
        db.courses.get(r.courseId),
        db.tees.get(r.teeId),
        db.holeScores.where('roundId').equals(r.id).sortBy('holeNumber'),
      ])
      setCourse(c ?? null)
      setTee(t ?? null)
      setScores(s)
    })()
  }, [roundId])

  if (!round)
    return (
      <div className="p-4" style={{ color: 'var(--ink-muted)' }}>
        Loading…
      </div>
    )

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--ink)' }}>
          {course?.name ?? 'Deleted course'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          {new Date(round.date).toLocaleDateString()} · {tee?.name ?? ''} tees
        </p>
      </div>

      <HoleScoreTable scores={scores} />

      {!round.completed && (
        <Link
          to={`/round/${round.id}`}
          className="text-center min-h-14 rounded-2xl font-semibold flex items-center justify-center text-white"
          style={{
            background: 'linear-gradient(180deg, #8CF0A8 0%, #34C864 48%, #1E9E4A 100%)',
            boxShadow: '0 8px 16px rgba(20,120,60,0.35)',
          }}
        >
          Resume round
        </Link>
      )}
    </div>
  )
}
