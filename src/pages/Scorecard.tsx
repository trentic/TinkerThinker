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

  if (!round) return <div className="p-4 text-neutral-500">Loading…</div>

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-white mt-2">{course?.name ?? 'Deleted course'}</h1>
        <p className="text-neutral-500 text-sm">
          {new Date(round.date).toLocaleDateString()} · {tee?.name ?? ''} tees
        </p>
      </div>

      <HoleScoreTable scores={scores} />

      {!round.completed && (
        <Link
          to={`/round/${round.id}`}
          className="text-center min-h-14 rounded-2xl bg-green-600 text-white font-semibold flex items-center justify-center"
        >
          Resume round
        </Link>
      )}
    </div>
  )
}
