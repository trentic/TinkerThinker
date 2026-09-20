import { useEffect, useState } from 'react'
import { computeStats, computeClubDistances, type StatsSummary, type ClubStats } from '../lib/stats'

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-900 rounded-2xl p-4">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-neutral-500 text-xs mt-1">{label}</div>
    </div>
  )
}

const fmt = (n: number | null, digits = 1, suffix = '') =>
  n === null ? '—' : `${n.toFixed(digits)}${suffix}`

export function Stats() {
  const [stats, setStats] = useState<StatsSummary | null>(null)
  const [clubs, setClubs] = useState<ClubStats[]>([])

  useEffect(() => {
    computeStats().then(setStats)
    computeClubDistances().then(setClubs)
  }, [])

  if (!stats) return <div className="p-4 text-neutral-500">Loading...</div>

  if (stats.roundsPlayed === 0) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-white mt-2 mb-4">Stats</h1>
        <p className="text-neutral-500 text-sm">
          Finish a round to start seeing your stats here.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-white mt-2">Stats</h1>
      <p className="text-neutral-500 text-sm -mt-2">
        {stats.roundsPlayed} round{stats.roundsPlayed === 1 ? '' : 's'} tracked. Raw stats only —
        no handicap index.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Scoring average" value={fmt(stats.scoringAverage)} />
        <StatTile
          label="Best round (to par)"
          value={stats.bestRound ? (stats.bestRound.toPar > 0 ? `+${stats.bestRound.toPar}` : String(stats.bestRound.toPar)) : '—'}
        />
        <StatTile label="Fairways hit" value={fmt(stats.fairwaysHitPct, 0, '%')} />
        <StatTile label="Greens in regulation" value={fmt(stats.girPct, 0, '%')} />
        <StatTile label="Putts per round" value={fmt(stats.puttsPerRound)} />
        <StatTile label="Scrambling" value={fmt(stats.scramblingPct, 0, '%')} />
      </div>

      {Object.keys(stats.penaltyBreakdown).length > 0 && (
        <div className="bg-neutral-900 rounded-2xl p-4">
          <div className="font-semibold text-white mb-2">Penalties</div>
          {Object.entries(stats.penaltyBreakdown).map(([type, count]) => (
            <div key={type} className="flex justify-between text-sm text-neutral-400 py-1">
              <span className="capitalize">{type}</span>
              <span>{count}</span>
            </div>
          ))}
        </div>
      )}

      {clubs.length > 0 && (
        <div className="bg-neutral-900 rounded-2xl p-4">
          <div className="font-semibold text-white mb-2">Club distances (self-tracked)</div>
          {clubs.map((c) => (
            <div key={c.club} className="flex justify-between text-sm text-neutral-400 py-1">
              <span>{c.club}</span>
              <span>
                {c.avgYards}y avg <span className="text-neutral-600">({c.shotCount} shots)</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="bg-neutral-900 rounded-2xl p-4">
        <div className="font-semibold text-white mb-2">Recent rounds</div>
        {stats.recentRounds.map((r) => (
          <div key={r.roundId} className="flex justify-between text-sm text-neutral-400 py-1">
            <span>{new Date(r.date).toLocaleDateString()}</span>
            <span>
              {r.totalStrokes} ({r.toPar > 0 ? `+${r.toPar}` : r.toPar})
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
