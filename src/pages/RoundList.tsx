import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'

export function RoundList() {
  const rounds = useLiveQuery(() => db.rounds.orderBy('date').reverse().toArray(), [])
  const courses = useLiveQuery(() => db.courses.toArray(), [])
  const courseName = (id: string) => courses?.find((c) => c.id === id)?.name ?? 'Unknown course'

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-3">
      <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--ink)' }}>
        Rounds
      </h1>
      {rounds?.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          No rounds yet.
        </p>
      )}
      {rounds?.map((round) => (
        <Link
          key={round.id}
          to={round.completed ? `/round/${round.id}/scorecard` : `/round/${round.id}`}
          className="glass rounded-2xl p-4 flex justify-between items-center"
        >
          <div>
            <div className="font-semibold" style={{ color: 'var(--ink)' }}>
              {courseName(round.courseId)}
            </div>
            <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>
              {new Date(round.date).toLocaleDateString()}
            </div>
          </div>
          <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            {round.completed ? 'Finished' : 'In progress'}
          </div>
        </Link>
      ))}
    </div>
  )
}
