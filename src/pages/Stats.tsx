import { useLiveQuery } from 'dexie-react-hooks'
import { computeStats, computeClubDistances } from '../lib/stats'
import { toParLabel } from '../lib/format'

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>
        {label}
      </div>
    </div>
  )
}

const fmt = (n: number | null, digits = 1, suffix = '') =>
  n === null ? '—' : `${n.toFixed(digits)}${suffix}`

export function Stats() {
  // Live queries (not a one-shot effect) so this refreshes automatically
  // after any data change — including a Google Drive pull or local backup
  // restore, which write straight to IndexedDB without navigating here.
  const stats = useLiveQuery(() => computeStats(), [])
  const clubs = useLiveQuery(() => computeClubDistances(), []) ?? []

  if (!stats)
    return (
      <div className="p-4" style={{ color: 'var(--ink-muted)' }}>
        Loading...
      </div>
    )

  if (stats.roundsPlayed === 0) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mt-2 mb-4" style={{ color: 'var(--ink)' }}>
          Stats
        </h1>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Finish a round to start seeing your stats here.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--ink)' }}>
        Stats
      </h1>
      <p className="text-sm -mt-2" style={{ color: 'var(--ink-muted)' }}>
        {stats.roundsPlayed} round{stats.roundsPlayed === 1 ? '' : 's'} tracked. Raw stats only —
        no handicap index.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Avg score (to par)" value={toParLabel(stats.avgToPar)} />
        <StatTile label="Best round (to par)" value={stats.bestRound ? toParLabel(stats.bestRound.toPar) : '—'} />
        <StatTile label="Fairways hit" value={fmt(stats.fairwaysHitPct, 0, '%')} />
        <StatTile label="Greens in regulation" value={fmt(stats.girPct, 0, '%')} />
        <StatTile label="Putts per 9 holes" value={fmt(stats.puttsPer9)} />
        <StatTile label="Scrambling" value={fmt(stats.scramblingPct, 0, '%')} />
      </div>

      {Object.keys(stats.penaltyBreakdown).length > 0 && (
        <div className="glass rounded-2xl p-4">
          <div className="font-semibold mb-2" style={{ color: 'var(--ink)' }}>
            Penalties{' '}
            <span className="font-normal" style={{ color: 'var(--ink-muted)' }}>
              ({fmt(stats.penaltiesPer9)} per 9 holes)
            </span>
          </div>
          {Object.entries(stats.penaltyBreakdown).map(([type, count]) => (
            <div key={type} className="flex justify-between text-sm py-1" style={{ color: 'var(--ink-secondary)' }}>
              <span className="capitalize">{type}</span>
              <span>{count}</span>
            </div>
          ))}
        </div>
      )}

      {clubs.length > 0 && (
        <div className="glass rounded-2xl p-4">
          <div className="font-semibold mb-2" style={{ color: 'var(--ink)' }}>
            Club distances (self-tracked)
          </div>
          {clubs.map((c) => (
            <div key={c.club} className="flex justify-between text-sm py-1" style={{ color: 'var(--ink-secondary)' }}>
              <span>{c.club}</span>
              <span>
                {c.avgYards}y{' '}
                <span style={{ color: 'var(--ink-muted)' }}>
                  {c.isSelfReported ? '(self-reported)' : `(${c.shotCount} shots)`}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="glass rounded-2xl p-4">
        <div className="font-semibold mb-2" style={{ color: 'var(--ink)' }}>
          Recent rounds
        </div>
        {stats.recentRounds.map((r) => (
          <div key={r.roundId} className="flex justify-between text-sm py-1" style={{ color: 'var(--ink-secondary)' }}>
            <span>
              {new Date(r.date).toLocaleDateString()}{' '}
              <span style={{ color: 'var(--ink-muted)' }}>({r.holesPlayed}H)</span>
            </span>
            <span>
              {r.totalStrokes} ({toParLabel(r.toPar)})
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
