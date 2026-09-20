import type { HoleScore } from '../db/schema'
import { toParLabel } from '../lib/format'

function sum(list: HoleScore[], key: 'strokes' | 'par' | 'putts') {
  return list.reduce((total, s) => total + s[key], 0)
}

interface HoleScoreTableProps {
  scores: HoleScore[]
  showTotal?: boolean
}

/** Standard front-9/back-9 scorecard table, shared by the final scorecard
 * and the mid-round hole-transition summary. */
export function HoleScoreTable({ scores, showTotal = true }: HoleScoreTableProps) {
  const front = scores.filter((s) => s.holeNumber <= 9)
  const back = scores.filter((s) => s.holeNumber > 9)

  return (
    <div className="flex flex-col gap-4">
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

      {showTotal && scores.length > 0 && (
        <div className="bg-neutral-900 rounded-2xl p-4 flex justify-between items-center">
          <span className="text-neutral-400">Total</span>
          <span className="text-2xl font-bold text-white">
            {sum(scores, 'strokes')} ({toParLabel(sum(scores, 'strokes') - sum(scores, 'par'))})
          </span>
        </div>
      )}
    </div>
  )
}
