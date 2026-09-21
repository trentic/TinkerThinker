import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BigButton } from '../components/BigButton'
import { Modal } from '../components/Modal'
import { HoleScoreTable } from '../components/HoleScoreTable'
import { SatelliteMap, type MapPin, type MapOutline } from '../components/SatelliteMap'
import { db, newId } from '../db/db'
import type { Course, Hole, HoleScore, PenaltyType, Round, Tee } from '../db/schema'
import { destinationPoint, distanceYards, getCurrentPosition, type LatLng } from '../lib/geo'
import {
  calculatePlaysLike,
  getCurrentWind,
  getElevationMeters,
  windCompassLabel,
  type PlaysLikeResult,
  type WindInfo,
} from '../lib/playsLike'
import { COMMON_CLUBS } from '../lib/clubs'
import { isDebugLocationEnabled, isMulliganEnabled } from '../lib/settings'
import { getMockPosition, setMockPosition } from '../lib/debugLocation'
import { toParLabel } from '../lib/format'

const PENALTY_LABELS: Record<PenaltyType, string> = {
  water: 'Water hazard',
  oob: 'Out of bounds',
  lost: 'Lost ball',
  unplayable: 'Unplayable lie',
}

const ink = { color: 'var(--ink)' }
const inkSecondary = { color: 'var(--ink-secondary)' }
const inkMuted = { color: 'var(--ink-muted)' }
const amberText = { color: '#8a5a12' }
const amberTextSoft = { color: '#8a5a12', opacity: 0.75 }
const toggleOn = {
  background: 'linear-gradient(180deg, #8CF0A8 0%, #34C864 48%, #1E9E4A 100%)',
  boxShadow: '0 4px 10px rgba(20,120,60,0.35)',
  color: '#ffffff',
}
const toggleOff = { background: 'rgba(255,255,255,0.5)', color: 'var(--ink-muted)' }
const amberToggleOn = { background: 'linear-gradient(180deg, #FFD08A, #E8A020)', color: '#5c3a00' }
const amberToggleOff = { background: 'rgba(255,255,255,0.5)', color: '#8a5a12' }

type HistoryEntry =
  | { kind: 'shot'; shotId: string; prevLastMarkedPos: LatLng | null; wasFirstShot: boolean }
  | { kind: 'penalty'; shotId: string; penaltyType: PenaltyType }
  | { kind: 'putt' }

type Panel = 'shot' | 'clubs'

export function RoundActive() {
  const { roundId } = useParams<{ roundId: string }>()
  const navigate = useNavigate()

  const [round, setRound] = useState<Round | null>(null)
  const [course, setCourse] = useState<Course | null>(null)
  const [tee, setTee] = useState<Tee | null>(null)
  const [holesList, setHolesList] = useState<Hole[]>([])
  const [currentHoleNumber, setCurrentHoleNumber] = useState<number | null>(null)

  const [myPos, setMyPos] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [target, setTarget] = useState<LatLng | null>(null)
  const [playsLike, setPlaysLike] = useState<PlaysLikeResult | null>(null)
  const [wind, setWind] = useState<WindInfo | null>(null)
  const [yardageLoading, setYardageLoading] = useState(false)

  const [strokes, setStrokes] = useState(0)
  const [putts, setPutts] = useState(0)
  const [penalties, setPenalties] = useState<PenaltyType[]>([])
  const [lastMarkedPos, setLastMarkedPos] = useState<LatLng | null>(null)
  const [fairwayHit, setFairwayHit] = useState<boolean | null>(null)
  const [askFairway, setAskFairway] = useState(false)
  const [puttMode, setPuttMode] = useState(false)
  const [strokesBeforePutting, setStrokesBeforePutting] = useState<number | null>(null)
  // Tracks whether entering putt mode just captured this hole's first-ever
  // green location, so a mis-tap can be backed out cleanly (see leavePuttMode).
  const [justCapturedGreen, setJustCapturedGreen] = useState(false)
  const [showPenaltyMenu, setShowPenaltyMenu] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const [panel, setPanel] = useState<Panel>('shot')
  const [armedClub, setArmedClub] = useState<string | null>(null)
  const [showMap, setShowMap] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const mulliganEnabled = useMemo(() => isMulliganEnabled(), [])
  const debugLocationEnabled = useMemo(() => isDebugLocationEnabled(), [])
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [debugStepYards, setDebugStepYards] = useState(10)

  // Shown between holes: a running scorecard plus a deliberately-delayed
  // button to confirm arrival at the next tee (see finishHole/confirmAtNextTee).
  const [holeSummary, setHoleSummary] = useState<{ nextHole: Hole; allScores: HoleScore[] } | null>(null)
  const [nextTeeCooldown, setNextTeeCooldown] = useState(0)
  const [capturingNextTee, setCapturingNextTee] = useState(false)

  const bagClubs = useLiveQuery(() => db.bagClubs.toArray(), [])
  const clubChoices = useMemo(() => {
    const inBag = (bagClubs ?? []).filter((c) => c.inBag).map((c) => c.club)
    return inBag.length > 0 ? inBag : COMMON_CLUBS
  }, [bagClubs])

  const currentHole = useMemo(
    () => holesList.find((h) => h.number === currentHoleNumber) ?? null,
    [holesList, currentHoleNumber],
  )

  // Load round/course/tee/holes, and figure out which hole to resume on.
  useEffect(() => {
    if (!roundId) return
    ;(async () => {
      const r = await db.rounds.get(roundId)
      if (!r) return
      setRound(r)
      const [c, t, holes, doneScores] = await Promise.all([
        db.courses.get(r.courseId),
        db.tees.get(r.teeId),
        db.holes.where('courseId').equals(r.courseId).sortBy('number'),
        db.holeScores.where('roundId').equals(r.id).toArray(),
      ])
      setCourse(c ?? null)
      setTee(t ?? null)

      // Only the holes this round actually covers (front 9 / back 9 / all
      // 18), in the order the round plays them.
      const holeByNumber = new Map(holes.map((h) => [h.number, h]))
      const orderedHoles = r.holeNumbers
        .map((n) => holeByNumber.get(n))
        .filter((h): h is Hole => h !== undefined)
      setHolesList(orderedHoles)

      const doneNumbers = new Set(doneScores.map((h) => h.holeNumber))
      const next = orderedHoles.find((h) => !doneNumbers.has(h.number))
      if (!next) {
        navigate(`/round/${r.id}/scorecard`)
        return
      }
      setCurrentHoleNumber(next.number)
    })()
  }, [roundId, navigate])

  // Reset per-hole state when the hole changes.
  useEffect(() => {
    setStrokes(0)
    setPutts(0)
    setPenalties([])
    setLastMarkedPos(null)
    setFairwayHit(null)
    setAskFairway(false)
    setPuttMode(false)
    setStrokesBeforePutting(null)
    setJustCapturedGreen(false)
    setTarget(null)
    setPlaysLike(null)
    setWind(null)
    setHistory([])
    setArmedClub(null)
    setPanel('shot')
    setShowMap(false)
    // Debug mode: start each hole with the simulated position at this
    // hole's tee, like you just walked up to it, instead of wherever
    // testing left off on the previous hole.
    if (debugLocationEnabled && currentHole) {
      const seed = (tee && currentHole.teeCoords[tee.id]) || {
        lat: currentHole.centerLat,
        lng: currentHole.centerLng,
      }
      setMockPosition(seed)
    }
    void refreshMyPosition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHoleNumber])

  // Ticks the "I'm At The Next Tee" cooldown down once a second while the
  // hole-transition summary is showing.
  useEffect(() => {
    if (!holeSummary || nextTeeCooldown <= 0) return
    const t = setTimeout(() => setNextTeeCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [holeSummary, nextTeeCooldown])

  async function refreshMyPosition(): Promise<LatLng | null> {
    setLocating(true)
    try {
      const pos = await getCurrentPosition()
      const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setMyPos(ll)
      return ll
    } catch {
      return myPos
    } finally {
      setLocating(false)
    }
  }

  async function setHoleTeeCoordinate(hole: Hole, teeId: string, pos: LatLng) {
    const updatedCoords = { ...hole.teeCoords, [teeId]: pos }
    await db.holes.update(hole.id, { teeCoords: updatedCoords })
    setHolesList((prev) => prev.map((h) => (h.id === hole.id ? { ...h, teeCoords: updatedCoords } : h)))
  }

  // Explicit, deliberate tee capture — only offered before the first stroke.
  // Replaces the old implicit "grab GPS whenever yardage is first checked"
  // behavior, which could fire from wherever the golfer happened to be
  // standing rather than the tee itself.
  async function handleSetTee() {
    if (!currentHole || !tee) return
    const pos = await refreshMyPosition()
    if (pos) await setHoleTeeCoordinate(currentHole, tee.id, pos)
  }

  function moveDebugPosition(pos: LatLng) {
    setMockPosition(pos)
    setMyPos(pos)
  }

  function nudgeDebugPosition(bearingDeg: number, yards: number) {
    const from = getMockPosition() ?? myPos
    if (!from) return
    moveDebugPosition(destinationPoint(from, bearingDeg, yards))
  }

  async function handleTapTarget(pos: LatLng) {
    if (!round || !tee) return
    setTarget(pos)
    setYardageLoading(true)
    try {
      const origin = (await refreshMyPosition()) ?? myPos
      if (!origin) return

      const [elevations, wind] = await Promise.all([
        getElevationMeters([origin, pos]),
        getCurrentWind(origin),
      ])
      setWind(wind)
      setPlaysLike(
        calculatePlaysLike({
          from: origin,
          to: pos,
          fromElevationM: elevations[0],
          toElevationM: elevations[1],
          wind,
        }),
      )
    } finally {
      setYardageLoading(false)
    }
  }

  async function handleMarkShot() {
    if (!round || !currentHole) return
    const newPos = await refreshMyPosition()
    if (!newPos) return

    // Log the distance from the previous shot (or the tee) before clearing
    // the armed club, so it feeds the club's yardage stats.
    const prevPos = lastMarkedPos ?? currentHole.teeCoords[tee?.id ?? ''] ?? null
    const distance = prevPos ? Math.round(distanceYards(prevPos, newPos)) : undefined

    const nextStroke = strokes + 1
    const shotId = newId()
    await db.shots.add({
      id: shotId,
      roundId: round.id,
      holeNumber: currentHole.number,
      strokeNumber: nextStroke,
      lat: newPos.lat,
      lng: newPos.lng,
      type: nextStroke === 1 ? 'tee' : 'approach',
      club: armedClub ?? undefined,
      distanceYardsFromPrev: distance,
      timestamp: Date.now(),
    })

    setHistory((h) => [
      ...h,
      { kind: 'shot', shotId, prevLastMarkedPos: lastMarkedPos, wasFirstShot: strokes === 0 },
    ])
    setStrokes(nextStroke)
    setLastMarkedPos(newPos)
    setTarget(null)
    setPlaysLike(null)
    setWind(null)
    setArmedClub(null)

    if (nextStroke === 1 && currentHole.par >= 4) {
      setAskFairway(true)
    }
  }

  function selectClub(club: string) {
    setArmedClub((prev) => (prev === club ? null : club))
    setPanel('shot')
  }

  async function applyPenalty(type: PenaltyType) {
    if (!round || !currentHole) return
    // Best known position for where the penalty happened: the last marked
    // shot, a live GPS reading (refreshMyPosition falls back to the last
    // known fix on its own if a fresh read fails), and only as a last
    // resort the hole's own location — never (0,0), which would silently
    // record a shot in the Gulf of Guinea.
    const position = lastMarkedPos ?? (await refreshMyPosition()) ?? {
      lat: currentHole.centerLat,
      lng: currentHole.centerLng,
    }

    const nextStroke = strokes + 1
    const shotId = newId()
    await db.shots.add({
      id: shotId,
      roundId: round.id,
      holeNumber: currentHole.number,
      strokeNumber: nextStroke,
      lat: position.lat,
      lng: position.lng,
      type: 'penalty',
      penaltyType: type,
      timestamp: Date.now(),
    })
    setHistory((h) => [...h, { kind: 'penalty', shotId, penaltyType: type }])
    setStrokes(nextStroke)
    setPenalties((prev) => [...prev, type])
    setShowPenaltyMenu(false)
    // Stroke-and-distance: replay from the same spot, so lastMarkedPos is unchanged.
  }

  async function enterPuttMode() {
    setPuttMode(true)
    setStrokesBeforePutting(strokes)
    if (currentHole && !currentHole.greenLat) {
      const pos = await refreshMyPosition()
      if (pos) {
        await db.holes.update(currentHole.id, { greenLat: pos.lat, greenLng: pos.lng })
        setHolesList((prev) =>
          prev.map((h) => (h.id === currentHole.id ? { ...h, greenLat: pos.lat, greenLng: pos.lng } : h)),
        )
        setJustCapturedGreen(true)
      }
    }
  }

  // Backs out of a mis-tapped "On the green" — e.g. a chip that didn't
  // actually reach the green and needs another GPS-tracked approach shot,
  // not a putt. If we just captured this hole's green location moments ago
  // and nothing was putted yet, undo that capture too rather than leaving a
  // wrong green position saved permanently.
  async function leavePuttMode() {
    if (justCapturedGreen && putts === 0 && currentHole) {
      await db.holes.update(currentHole.id, { greenLat: undefined, greenLng: undefined })
      setHolesList((prev) =>
        prev.map((h) => (h.id === currentHole.id ? { ...h, greenLat: undefined, greenLng: undefined } : h)),
      )
    }
    setJustCapturedGreen(false)
    setStrokesBeforePutting(null)
    setPuttMode(false)
  }

  function addPutt() {
    setHistory((h) => [...h, { kind: 'putt' }])
    setPutts((p) => p + 1)
    setStrokes((s) => s + 1)
  }

  function handleMulligan() {
    const last = history[history.length - 1]
    if (!last) return
    setHistory((h) => h.slice(0, -1))

    if (last.kind === 'putt') {
      setPutts((p) => Math.max(0, p - 1))
      setStrokes((s) => Math.max(0, s - 1))
      return
    }

    if (last.kind === 'penalty') {
      setPenalties((prev) => {
        const idx = prev.lastIndexOf(last.penaltyType)
        if (idx === -1) return prev
        const copy = [...prev]
        copy.splice(idx, 1)
        return copy
      })
      setStrokes((s) => Math.max(0, s - 1))
      void db.shots.delete(last.shotId)
      return
    }

    // kind === 'shot'
    setStrokes((s) => Math.max(0, s - 1))
    setLastMarkedPos(last.prevLastMarkedPos)
    void db.shots.delete(last.shotId)
    if (last.wasFirstShot) {
      setFairwayHit(null)
      setAskFairway(false)
    }
  }

  async function finishHole() {
    if (!round || !currentHole) return
    const gir = strokesBeforePutting !== null ? strokesBeforePutting <= currentHole.par - 2 : null

    const holeScore: HoleScore = {
      id: newId(),
      roundId: round.id,
      holeNumber: currentHole.number,
      par: currentHole.par,
      strokes,
      putts,
      penalties,
      fairwayHit: currentHole.par >= 4 ? fairwayHit : null,
      greenInRegulation: gir,
    }
    await db.holeScores.add(holeScore)

    const idx = holesList.findIndex((h) => h.number === currentHole.number)
    const next = holesList[idx + 1]
    if (!next) {
      await db.rounds.update(round.id, { completed: true })
      navigate(`/round/${round.id}/scorecard`)
      return
    }

    const allScores = await db.holeScores.where('roundId').equals(round.id).toArray()
    setHoleSummary({ nextHole: next, allScores })
    setNextTeeCooldown(5)
  }

  async function confirmAtNextTee() {
    if (!holeSummary || nextTeeCooldown > 0 || !tee) return
    setCapturingNextTee(true)
    try {
      const pos = await refreshMyPosition()
      if (pos) await setHoleTeeCoordinate(holeSummary.nextHole, tee.id, pos)
      const nextNumber = holeSummary.nextHole.number
      setHoleSummary(null)
      setCurrentHoleNumber(nextNumber)
    } finally {
      setCapturingNextTee(false)
    }
  }

  function onTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function onTouchEnd(e: TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (panel === 'shot' && dx < -60) setPanel('clubs')
    else if (panel === 'clubs' && dx > 60) setPanel('shot')
  }

  if (!round || !course || !tee || !currentHole) {
    return (
      <div className="p-4" style={inkMuted}>
        Loading round…
      </div>
    )
  }

  const mapCenter = currentHole.teeCoords[tee.id] ?? {
    lat: currentHole.centerLat,
    lng: currentHole.centerLng,
  }
  const pins: MapPin[] = [
    {
      id: 'hole',
      position: { lat: currentHole.centerLat, lng: currentHole.centerLng },
      label: 'C',
      color: '#6b7280',
    },
  ]
  if (currentHole.greenLat && currentHole.greenLng) {
    pins.push({
      id: 'green',
      position: { lat: currentHole.greenLat, lng: currentHole.greenLng },
      label: '⛳',
      color: '#16a34a',
    })
  }
  if (myPos) pins.push({ id: 'me', position: myPos, label: '●', color: '#2563eb' })
  if (target) pins.push({ id: 'target', position: target, label: '🎯', color: '#dc2626' })
  const outlines: MapOutline[] = currentHole.outline
    ? [{ id: 'hole-outline', coordinates: currentHole.outline, color: '#f59e0b' }]
    : []

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-3 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={ink}>
          Hole {currentHole.number} · Par {currentHole.par}
        </h1>
        <span className="text-sm" style={inkSecondary}>
          {tee.name} tees
        </span>
      </div>

      {holeSummary ? (
        <div className="flex flex-col gap-3">
          <div className="glass rounded-2xl p-4 text-center">
            <div className="text-sm" style={inkSecondary}>
              Hole {currentHole.number} complete
            </div>
            <div className="text-3xl font-bold mt-1" style={ink}>
              {strokes} ({toParLabel(strokes - currentHole.par)})
            </div>
          </div>

          <HoleScoreTable scores={holeSummary.allScores} />

          <div className="flex justify-end">
            <BigButton onClick={confirmAtNextTee} disabled={nextTeeCooldown > 0 || capturingNextTee}>
              {capturingNextTee
                ? 'Setting tee…'
                : nextTeeCooldown > 0
                  ? `I'm At The Next Tee (${nextTeeCooldown})`
                  : "I'm At The Next Tee"}
            </BigButton>
          </div>
        </div>
      ) : (
        <>
          {debugLocationEnabled && (
            <div className="glass-solid rounded-xl p-3 flex flex-col gap-3">
              <button
                onClick={() => setShowDebugPanel((v) => !v)}
                className="flex items-center justify-between text-sm font-semibold"
                style={amberText}
              >
                <span>
                  Simulated location
                  {myPos && ` · ${myPos.lat.toFixed(5)}, ${myPos.lng.toFixed(5)}`}
                </span>
                <span>{showDebugPanel ? '▲' : '▼'}</span>
              </button>

              {showDebugPanel && (
                <div className="flex flex-col gap-3">
                  <div className="h-48 rounded-xl overflow-hidden">
                    <SatelliteMap
                      center={myPos ?? mapCenter}
                      pins={myPos ? [{ id: 'debug-me', position: myPos, label: '●', color: '#2563eb' }] : []}
                      onMapClick={moveDebugPosition}
                    />
                  </div>
                  <p className="text-xs" style={amberTextSoft}>
                    Tap the map to teleport there, or nudge:
                  </p>

                  <div className="flex justify-center gap-2">
                    {[5, 10, 25].map((yards) => (
                      <button
                        key={yards}
                        onClick={() => setDebugStepYards(yards)}
                        className="min-h-8 px-3 rounded-full text-xs font-medium"
                        style={debugStepYards === yards ? amberToggleOn : amberToggleOff}
                      >
                        {yards}y
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2 w-40 mx-auto">
                    <div />
                    <button
                      onClick={() => nudgeDebugPosition(0, debugStepYards)}
                      className="rounded-lg py-3 text-lg"
                      style={amberToggleOn}
                    >
                      ▲
                    </button>
                    <div />
                    <button
                      onClick={() => nudgeDebugPosition(270, debugStepYards)}
                      className="rounded-lg py-3 text-lg"
                      style={amberToggleOn}
                    >
                      ◀
                    </button>
                    <div />
                    <button
                      onClick={() => nudgeDebugPosition(90, debugStepYards)}
                      className="rounded-lg py-3 text-lg"
                      style={amberToggleOn}
                    >
                      ▶
                    </button>
                    <div />
                    <button
                      onClick={() => nudgeDebugPosition(180, debugStepYards)}
                      className="rounded-lg py-3 text-lg"
                      style={amberToggleOn}
                    >
                      ▼
                    </button>
                    <div />
                  </div>

                  {currentHole.teeCoords[tee.id] ? (
                    <BigButton
                      variant="secondary"
                      onClick={() => moveDebugPosition(currentHole.teeCoords[tee.id])}
                    >
                      Reset to tee
                    </BigButton>
                  ) : (
                    <p className="text-xs text-center" style={amberTextSoft}>
                      This tee hasn't been set yet — use "Set tee" on the hole screen once you're there.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {showMap ? (
            // Range-reading screen: brought up deliberately, one big button to leave it.
            // Everything else (strokes, finish, drive-mode buttons) is hidden while here
            // so the map doesn't compete with them for attention.
            <div className="flex flex-col gap-3">
              <BigButton variant="secondary" onClick={() => setShowMap(false)}>
                ‹ Back
              </BigButton>
              <div className="h-[55vh] rounded-2xl overflow-hidden relative">
                <SatelliteMap
                  center={mapCenter}
                  pins={pins}
                  outlines={outlines}
                  onMapClick={(pos) => void handleTapTarget(pos)}
                />
                {locating && (
                  <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    Locating…
                  </div>
                )}
              </div>
              <p className="text-xs -mt-1" style={inkMuted}>
                Tap where you're aiming.
              </p>

              {yardageLoading && (
                <div className="text-sm" style={inkSecondary}>
                  Calculating plays-like yardage…
                </div>
              )}
              {playsLike && !yardageLoading && (
                <div className="glass rounded-2xl p-4 flex flex-col gap-1">
                  <div className="text-3xl font-bold" style={ink}>
                    {playsLike.playsLikeYards} yd plays like
                  </div>
                  <div className="text-sm" style={inkMuted}>
                    {playsLike.actualYards} yd straight · {playsLike.elevationAdjustYards >= 0 ? '+' : ''}
                    {playsLike.elevationAdjustYards} elevation · {playsLike.windAdjustYards >= 0 ? '+' : ''}
                    {playsLike.windAdjustYards} wind
                  </div>
                  {wind && (
                    <div className="text-sm" style={inkMuted}>
                      {Math.round(wind.speedMph)} mph from {windCompassLabel(wind.directionDeg)}
                    </div>
                  )}
                  <div className="text-xs" style={inkMuted}>
                    Estimate — not laser-precision.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-hidden">
                <div
                  className="flex transition-transform duration-200 ease-out"
                  style={{ width: '200%', transform: panel === 'clubs' ? 'translateX(-50%)' : 'translateX(0%)' }}
                  onTouchStart={onTouchStart}
                  onTouchEnd={onTouchEnd}
                >
                  {/* Drive-mode pane: big buttons only, no map */}
                  <div className="w-1/2 pr-1 flex flex-col gap-3">
                    <button
                      onClick={() => setPanel('clubs')}
                      className="self-end text-sm underline"
                      style={inkSecondary}
                    >
                      My bag ›
                    </button>

                    {armedClub && (
                      <div className="flex items-center justify-between glass-solid rounded-xl px-3 py-2">
                        <span className="text-sm font-medium" style={{ color: 'var(--color-green)' }}>
                          Using {armedClub}
                        </span>
                        <button
                          onClick={() => setArmedClub(null)}
                          className="text-xs underline"
                          style={{ color: 'var(--color-green)' }}
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    {!puttMode ? (
                      <>
                        {strokes === 0 && (
                          <BigButton variant="secondary" onClick={handleSetTee}>
                            📍 Set tee (I'm standing on it)
                          </BigButton>
                        )}

                        <BigButton variant="secondary" onClick={() => setShowMap(true)}>
                          {playsLike
                            ? `📍 ${playsLike.playsLikeYards} yd plays like — recheck`
                            : '📍 Check yardage'}
                        </BigButton>

                        <div className="grid grid-cols-2 gap-3">
                          <BigButton variant="blue" onClick={handleMarkShot}>Mark my ball (+1)</BigButton>
                          <BigButton variant="danger" onClick={() => setShowPenaltyMenu(true)}>
                            Lost / Hazard
                          </BigButton>
                        </div>
                        <BigButton variant="secondary" onClick={enterPuttMode}>
                          On the green
                        </BigButton>
                      </>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="glass rounded-2xl p-6 text-center">
                          <div className="text-5xl font-bold" style={ink}>
                            {putts}
                          </div>
                          <div className="text-sm mt-1" style={inkMuted}>
                            putts this hole
                          </div>
                        </div>
                        <BigButton onClick={addPutt}>+1 Putt</BigButton>
                        <BigButton variant="danger" onClick={() => setShowPenaltyMenu(true)}>
                          Lost / Hazard
                        </BigButton>
                        <BigButton variant="ghost" onClick={leavePuttMode} disabled={putts > 0}>
                          Not on the green after all
                        </BigButton>
                      </div>
                    )}

                    {mulliganEnabled && (
                      <BigButton variant="ghost" onClick={handleMulligan} disabled={history.length === 0}>
                        ↩ Mulligan (undo last stroke)
                      </BigButton>
                    )}
                  </div>

                  {/* Clubs pane */}
                  <div className="w-1/2 pl-1 flex flex-col gap-3">
                    <button onClick={() => setPanel('shot')} className="text-sm underline" style={inkSecondary}>
                      ‹ Back
                    </button>
                    <p className="text-xs -mt-1" style={inkMuted}>
                      Tap the club you're using. It'll tag your next marked shot for club-distance stats.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {clubChoices.map((club) => (
                        <button
                          key={club}
                          onClick={() => selectClub(club)}
                          className="min-h-14 rounded-xl text-sm font-semibold"
                          style={armedClub === club ? toggleOn : toggleOff}
                        >
                          {club}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass rounded-2xl p-4 flex justify-between items-center">
                <span className="text-sm" style={inkSecondary}>
                  Strokes this hole
                </span>
                <span className="text-2xl font-bold" style={ink}>
                  {strokes}
                </span>
              </div>

              <BigButton onClick={finishHole} disabled={strokes === 0}>
                {holesList[holesList.length - 1]?.number === currentHole.number ? 'Finish round' : 'Next hole'}
              </BigButton>
            </>
          )}
        </>
      )}

      {askFairway && (
        <Modal onClose={() => setAskFairway(false)} title="Did your tee shot find the fairway?">
          <div className="grid grid-cols-2 gap-3">
            <BigButton
              onClick={() => {
                setFairwayHit(true)
                setAskFairway(false)
              }}
            >
              Yes
            </BigButton>
            <BigButton
              variant="secondary"
              onClick={() => {
                setFairwayHit(false)
                setAskFairway(false)
              }}
            >
              No
            </BigButton>
          </div>
        </Modal>
      )}

      {showPenaltyMenu && (
        <Modal onClose={() => setShowPenaltyMenu(false)} title="What happened?">
          <div className="flex flex-col gap-2">
            {(Object.keys(PENALTY_LABELS) as PenaltyType[]).map((type) => (
              <BigButton key={type} variant="danger" onClick={() => applyPenalty(type)}>
                {PENALTY_LABELS[type]} (+1 stroke)
              </BigButton>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
