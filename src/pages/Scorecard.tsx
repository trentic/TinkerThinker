import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { db } from '../db/db'
import type { Course, HoleScore, Round, Tee } from '../db/schema'

function relativeToPar(diff: number): string {
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : String(diff)
}

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

  if (!round || !course) return <div className="p-4 text-neutral-500">Loading…</div>

  const front = scores.filter((s) => s.holeNumber <= 9)
  const back = scores.filter((s) => s.holeNumber > 9)
  const sum = (list: HoleScore[], key: 'strokes' | 'par' | 'putts') =>
    list.reduce((total, s) => total + s[key], 0)

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-white mt-2">{course.name}</h1>
        <p className="text-neutral-500 text-sm">
          {new Date(round.date).toLocaleDateString()} · {tee?.name ?? ''} tees
        </p>
      </div>

      {[front, back].map((half, i) =>
        half.length > 0 ? (
          <div key={i} className="overflow-x-auto">
            <table className="w-full text-center text-sm">
              <thead>
                <tr className="text-neutral-500">
                  <th className="text-left font-normal pl-1">Hole</th>
                  {half.map((s) => (
                    <td key={s.holeNumber}>{s.holeNumber}</td>
                  ))}
                  <td className="font-semibold">{i === 0 ? 'OUT' : 'IN'}</td>
                </tr>
                <tr className="text-neutral-500">
                  <th className="text-left font-normal pl-1">Par</th>
                  {half.map((s) => (
                    <td key={s.holeNumber}>{s.par}</td>
                  ))}
                  <td className="font-semibold">{sum(half, 'par')}</td>
                </tr>
              </thead>
              <tbody>
                <tr className="text-white font-semibold">
                  <th className="text-left font-normal pl-1 text-neutral-500">Score</th>
                  {half.map((s) => (
                    <td
                      key={s.holeNumber}
                      className={
                        s.strokes < s.par ? 'text-green-400' : s.strokes > s.par ? 'text-red-400' : ''
                      }
                    >
                      {s.strokes}
                    </td>
                  ))}
                  <td>{sum(half, 'strokes')}</td>
                </tr>
                <tr className="text-neutral-500">
                  <th className="text-left font-normal pl-1">Putts</th>
                  {half.map((s) => (
                    <td key={s.holeNumber}>{s.putts}</td>
                  ))}
                  <td>{sum(half, 'putts')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null,
      )}

      {scores.length > 0 && (
        <div className="bg-neutral-900 rounded-2xl p-4 flex justify-between items-center">
          <span className="text-neutral-400">Total</span>
          <span className="text-2xl font-bold text-white">
            {sum(scores, 'strokes')} ({relativeToPar(sum(scores, 'strokes') - sum(scores, 'par'))})
          </span>
        </div>
      )}

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
