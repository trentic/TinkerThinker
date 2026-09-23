import { useLiveQuery } from 'dexie-react-hooks'
import { computeStats, computeClubDistances } from '../lib/stats'
import { computeHandicapIndex } from '../lib/handicap'
import { computeClubDispersion } from '../lib/dispersion'
import { computeStrokesGainedOffTee } from '../lib/strokesGained'
import { toParLabel } from '../lib/format'
import { PENALTY_LABELS } from '../lib/penalties'
import { InfoTip } from '../components/InfoTip'
import { TrendChart } from '../components/TrendChart'
import type { PenaltyType } from '../db/schema'

function StatTile({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>
        {label}
        {info && <InfoTip term={label} explanation={info} />}
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
  const handicap = useLiveQuery(() => computeHandicapIndex(), [])
  const dispersion = useLiveQuery(() => computeClubDispersion(), []) ?? []
  const sgOffTee = useLiveQuery(() => computeStrokesGainedOffTee(), [])

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
        {stats.roundsPlayed} round{stats.roundsPlayed === 1 ? '' : 's'} tracked. Raw stats — not
        official numbers.
      </p>

      <div className="glass rounded-2xl p-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold flex items-center" style={{ color: 'var(--ink)' }}>
            Handicap Index
            <InfoTip
              term="Handicap Index"
              explanation="A simplified estimate of the USGA/WHS Handicap Index, using your best recent score differentials. This app doesn't apply the official net-double-bogey cap or playing-conditions adjustment, so treat it as a rough estimate, not an official number. Set a course rating and slope rating on your tees (Edit course) to enable it."
            />
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>
            {handicap
              ? `From ${handicap.roundsUsed} of your best ${handicap.roundsAvailable} rated 18-hole round${handicap.roundsAvailable === 1 ? '' : 's'}.`
              : 'Add course/slope rating to a tee (Edit course) to see this.'}
          </p>
        </div>
        <div className="text-2xl font-bold shrink-0" style={{ color: 'var(--ink)' }}>
          {handicap ? handicap.index.toFixed(1) : '—'}
        </div>
      </div>

      {stats.recentRounds.length >= 2 && (
        <div className="glass rounded-2xl p-4">
          <div className="font-semibold mb-2" style={{ color: 'var(--ink)' }}>
            Score trend
          </div>
          <TrendChart points={[...stats.recentRounds].reverse().map((r) => r.toPar)} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Avg score (to par)"
          value={toParLabel(stats.avgToPar)}
          info={
            '"To par" compares your score to the course\'s expected score. "+5" means 5 strokes over par (worse), "-2" means 2 under par (better), "E" means exactly even.'
          }
        />
        <StatTile
          label="Best round (to par)"
          value={stats.bestRound ? toParLabel(stats.bestRound.toPar) : '—'}
          info="Your lowest score relative to par across every round you've tracked."
        />
        <StatTile
          label="Fairways hit"
          value={fmt(stats.fairwaysHitPct, 0, '%')}
          info="Of your tee shots on par-4s and par-5s, the percentage that landed in the fairway rather than the rough or a bunker."
        />
        <StatTile
          label="Greens in regulation"
          value={fmt(stats.girPct, 0, '%')}
          info='"GIR" — how often you reached the putting surface in the "regulation" number of strokes (2 strokes less than par, leaving 2 putts for par). A common measure of approach-shot quality.'
        />
        <StatTile label="Putts per 9 holes" value={fmt(stats.puttsPer9)} />
        <StatTile
          label="Scrambling"
          value={fmt(stats.scramblingPct, 0, '%')}
          info="When you missed the green in regulation, how often you still made par or better anyway — a measure of short-game recovery."
        />
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
              <span>{PENALTY_LABELS[type as PenaltyType] ?? type}</span>
              <span>{count}</span>
            </div>
          ))}
        </div>
      )}

      {stats.lieBreakdown.fairway + stats.lieBreakdown.rough + stats.lieBreakdown.sand > 0 && (
        <div className="glass rounded-2xl p-4">
          <div className="font-semibold mb-2" style={{ color: 'var(--ink)' }}>
            Tee shots
          </div>
          {(['fairway', 'rough', 'sand'] as const).map((lie) => (
            <div key={lie} className="flex justify-between text-sm py-1" style={{ color: 'var(--ink-secondary)' }}>
              <span className="capitalize">{lie}</span>
              <span>{stats.lieBreakdown[lie]}</span>
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

      {dispersion.length > 0 && (
        <div className="glass rounded-2xl p-4">
          <div className="font-semibold mb-2 flex items-center" style={{ color: 'var(--ink)' }}>
            Club dispersion
            <InfoTip
              term="Club dispersion"
              explanation="An estimate of your left/right miss tendency per club, computed from your GPS-tracked shots against a straight line from where you hit to the green. It's an approximation, not a true intended-target measurement — doglegs and blind shots will skew it."
            />
          </div>
          {dispersion.map((d) => (
            <div key={d.club} className="flex justify-between text-sm py-1" style={{ color: 'var(--ink-secondary)' }}>
              <span>{d.club}</span>
              <span>
                {d.tendency === 'straight'
                  ? 'Straight'
                  : `${Math.abs(d.avgLateralYards)}y ${d.tendency === 'right' ? 'right' : 'left'}`}{' '}
                <span style={{ color: 'var(--ink-muted)' }}>({d.shotCount} shots)</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {sgOffTee && sgOffTee.avgSgOffTee !== null && (
        <div className="glass rounded-2xl p-4">
          <div className="font-semibold mb-2 flex items-center" style={{ color: 'var(--ink)' }}>
            Strokes gained: off the tee
            <InfoTip
              term="Strokes gained: off the tee"
              explanation="A simplified estimate of how your tee shots on par-4s/par-5s compare to an approximate baseline, using your recorded fairway/rough/sand result and where the shot ended up relative to the green. Positive means you gained strokes on the baseline (better than expected), negative means you lost strokes. This isn't official PGA Tour Strokes Gained data — it only covers tee shots, since approach lie and putt distance aren't tracked per-shot in this app."
            />
          </div>
          <div className="flex justify-between text-sm py-1" style={{ color: 'var(--ink-secondary)' }}>
            <span>Average</span>
            <span style={{ color: sgOffTee.avgSgOffTee >= 0 ? 'var(--color-green)' : 'var(--color-danger)' }}>
              {sgOffTee.avgSgOffTee >= 0 ? '+' : ''}
              {sgOffTee.avgSgOffTee.toFixed(2)}{' '}
              <span style={{ color: 'var(--ink-muted)' }}>({sgOffTee.shotCount} tee shots)</span>
            </span>
          </div>
          {Object.entries(sgOffTee.byClub).map(([club, c]) => (
            <div key={club} className="flex justify-between text-sm py-1" style={{ color: 'var(--ink-secondary)' }}>
              <span>{club}</span>
              <span style={{ color: c.avg >= 0 ? 'var(--color-green)' : 'var(--color-danger)' }}>
                {c.avg >= 0 ? '+' : ''}
                {c.avg.toFixed(2)} <span style={{ color: 'var(--ink-muted)' }}>({c.count})</span>
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
