import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'

export function RoundList() {
  const rounds = useLiveQuery(() => db.rounds.orderBy('date').reverse().toArray(), [])
  const courses = useLiveQuery(() => db.courses.toArray(), [])
  const courseName = (id: string) => courses?.find((c) => c.id === id)?.name ?? 'Unknown course'

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-3">
      <h1 className="text-2xl font-bold text-white mt-2">Rounds</h1>
      {rounds?.length === 0 && <p className="text-neutral-500 text-sm">No rounds yet.</p>}
      {rounds?.map((round) => (
        <Link
          key={round.id}
          to={round.completed ? `/round/${round.id}/scorecard` : `/round/${round.id}`}
          className="bg-neutral-900 rounded-2xl p-4 flex justify-between items-center"
        >
          <div>
            <div className="font-semibold text-white">{courseName(round.courseId)}</div>
            <div className="text-neutral-500 text-sm">{new Date(round.date).toLocaleDateString()}</div>
          </div>
          <div className="text-neutral-500 text-sm">{round.completed ? 'Finished' : 'In progress'}</div>
        </Link>
      ))}
    </div>
  )
}
