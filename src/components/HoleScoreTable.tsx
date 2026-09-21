import type { HoleScore } from '../db/schema'
import { toParLabel } from '../lib/format'

function sum(list: HoleScore[], key: 'strokes' | 'par' | 'putts') {
  return list.reduce((total, s) => total + s[key], 0)
}

interface HoleScoreTableProps {
  scores: HoleScore[]
  showTotal?: boolean
  onEditHole?: (score: HoleScore) => void
}

/** Standard front-9/back-9 scorecard table, shared by the final scorecard
 * and the mid-round hole-transition summary. When onEditHole is given, each
 * hole's score becomes tappable so a scoring mistake can be corrected. */
export function HoleScoreTable({ scores, showTotal = true, onEditHole }: HoleScoreTableProps) {
  const front = scores.filter((s) => s.holeNumber <= 9)
  const back = scores.filter((s) => s.holeNumber > 9)
  const muted = { color: 'var(--ink-muted)' }
  const ink = { color: 'var(--ink)' }

  return (
    <div className="flex flex-col gap-4">
      {[front, back].map((half, i) =>
        half.length > 0 ? (
          <div key={i} className="overflow-x-auto">
            <table className="w-full text-center text-sm">
              <thead>
                <tr style={muted}>
                  <th className="text-left font-normal pl-1">Hole</th>
                  {half.map((s) => (
                    <td key={s.holeNumber}>{s.holeNumber}</td>
                  ))}
                  <td className="font-semibold">{i === 0 ? 'OUT' : 'IN'}</td>
                </tr>
                <tr style={muted}>
                  <th className="text-left font-normal pl-1">Par</th>
                  {half.map((s) => (
                    <td key={s.holeNumber}>{s.par}</td>
                  ))}
                  <td className="font-semibold">{sum(half, 'par')}</td>
                </tr>
              </thead>
              <tbody>
                <tr className="font-semibold" style={ink}>
                  <th className="text-left font-normal pl-1" style={muted}>
                    Score
                  </th>
                  {half.map((s) => {
                    const scoreColor =
                      s.strokes < s.par
                        ? { color: 'var(--color-green)' }
                        : s.strokes > s.par
                          ? { color: 'var(--color-danger)' }
                          : undefined
                    return (
                      <td key={s.holeNumber} style={scoreColor}>
                        {onEditHole ? (
                          <button
                            onClick={() => onEditHole(s)}
                            className="w-full rounded-md underline decoration-dotted underline-offset-2"
                            style={scoreColor}
                          >
                            {s.strokes}
                          </button>
                        ) : (
                          s.strokes
                        )}
                      </td>
                    )
                  })}
                  <td>{sum(half, 'strokes')}</td>
                </tr>
                <tr style={muted}>
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
        <div className="glass rounded-2xl p-4 flex justify-between items-center">
          <span style={muted}>Total</span>
          <span className="text-2xl font-bold" style={ink}>
            {sum(scores, 'strokes')} ({toParLabel(sum(scores, 'strokes') - sum(scores, 'par'))})
          </span>
        </div>
      )}
    </div>
  )
}
