import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useParams, Link } from 'react-router-dom'
import { db } from '../db/db'
import type { HoleScore } from '../db/schema'
import { HoleScoreTable } from '../components/HoleScoreTable'
import { EditHoleScoreModal } from '../components/EditHoleScoreModal'

export function Scorecard() {
  const { roundId } = useParams<{ roundId: string }>()
  const [editingScore, setEditingScore] = useState<HoleScore | null>(null)

  // Live (not a one-shot effect) so this refreshes automatically after any
  // data change — including a Google Drive pull or local backup restore,
  // which write straight to IndexedDB without navigating here.
  const data = useLiveQuery(async () => {
    if (!roundId) return null
    const round = await db.rounds.get(roundId)
    if (!round) return null
    const [course, tee, scores] = await Promise.all([
      db.courses.get(round.courseId),
      db.tees.get(round.teeId),
      db.holeScores.where('roundId').equals(round.id).sortBy('holeNumber'),
    ])
    return { round, course: course ?? null, tee: tee ?? null, scores }
  }, [roundId])

  async function saveScore(updated: HoleScore) {
    await db.holeScores.put(updated)
    setEditingScore(null)
  }

  const round = data?.round ?? null
  const course = data?.course ?? null
  const tee = data?.tee ?? null
  const scores = data?.scores ?? []

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

      <HoleScoreTable scores={scores} onEditHole={setEditingScore} />
      <p className="text-xs -mt-2" style={{ color: 'var(--ink-muted)' }}>
        Tap a score to fix a mistake.
      </p>

      {editingScore && (
        <EditHoleScoreModal
          score={editingScore}
          onClose={() => setEditingScore(null)}
          onSave={saveScore}
        />
      )}

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
