import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BigButton } from '../components/BigButton'
import { SatelliteMap, type MapPin } from '../components/SatelliteMap'
import { db, newId } from '../db/db'
import type { Course, Hole, HoleScore, PenaltyType, Round, Tee } from '../db/schema'
import { distanceYards, getCurrentPosition, type LatLng } from '../lib/geo'
import { calculatePlaysLike, getCurrentWind, getElevationMeters, type PlaysLikeResult } from '../lib/playsLike'
import { COMMON_CLUBS } from '../lib/clubs'

const PENALTY_LABELS: Record<PenaltyType, string> = {
  water: 'Water hazard',
  oob: 'Out of bounds',
  lost: 'Lost ball',
  unplayable: 'Unplayable lie',
}

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
  const [yardageLoading, setYardageLoading] = useState(false)

  const [strokes, setStrokes] = useState(0)
  const [putts, setPutts] = useState(0)
  const [penalties, setPenalties] = useState<PenaltyType[]>([])
  const [lastMarkedPos, setLastMarkedPos] = useState<LatLng | null>(null)
  const [fairwayHit, setFairwayHit] = useState<boolean | null>(null)
  const [askFairway, setAskFairway] = useState(false)
  const [puttMode, setPuttMode] = useState(false)
  const [strokesBeforePutting, setStrokesBeforePutting] = useState<number | null>(null)
  const [showPenaltyMenu, setShowPenaltyMenu] = useState(false)
  const [clubPromptFor, setClubPromptFor] = useState<string | null>(null) // shot id

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
      setHolesList(holes)
      const doneNumbers = new Set(doneScores.map((h) => h.holeNumber))
      const next = holes.find((h) => !doneNumbers.has(h.number))
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
    setTarget(null)
    setPlaysLike(null)
    void refreshMyPosition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHoleNumber])

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

  async function handleTapTarget(pos: LatLng) {
    if (!round || !tee) return
    setTarget(pos)
    setYardageLoading(true)
    try {
      const origin = (await refreshMyPosition()) ?? myPos
      if (!origin) return

      // First look at the tee: lock in this tee's precise coordinates for
      // future rounds, captured from the golfer actually standing there.
      if (currentHole && strokes === 0 && !currentHole.teeCoords[tee.id]) {
        const updatedCoords = { ...currentHole.teeCoords, [tee.id]: origin }
        await db.holes.update(currentHole.id, { teeCoords: updatedCoords })
        setHolesList((prev) =>
          prev.map((h) => (h.id === currentHole.id ? { ...h, teeCoords: updatedCoords } : h)),
        )
      }

      const [elevations, wind] = await Promise.all([
        getElevationMeters([origin, pos]),
        getCurrentWind(origin),
      ])
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

    const origin = lastMarkedPos ?? currentHole.teeCoords[tee?.id ?? ''] ?? null
    const distance = origin ? Math.round(distanceYards(origin, newPos)) : undefined

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
      distanceYardsFromPrev: distance,
      timestamp: Date.now(),
    })

    setStrokes(nextStroke)
    setLastMarkedPos(newPos)
    setTarget(null)
    setPlaysLike(null)
    setClubPromptFor(shotId)

    if (nextStroke === 1 && currentHole.par >= 4) {
      setAskFairway(true)
    }
  }

  async function assignClub(shotId: string, club: string | null) {
    if (club) await db.shots.update(shotId, { club })
    setClubPromptFor(null)
  }

  async function applyPenalty(type: PenaltyType) {
    if (!round || !currentHole) return
    const nextStroke = strokes + 1
    await db.shots.add({
      id: newId(),
      roundId: round.id,
      holeNumber: currentHole.number,
      strokeNumber: nextStroke,
      lat: (lastMarkedPos ?? myPos)?.lat ?? 0,
      lng: (lastMarkedPos ?? myPos)?.lng ?? 0,
      type: 'penalty',
      penaltyType: type,
      timestamp: Date.now(),
    })
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
      }
    }
  }

  function addPutt() {
    setPutts((p) => p + 1)
    setStrokes((s) => s + 1)
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
    } else {
      setCurrentHoleNumber(next.number)
    }
  }

  if (!round || !course || !tee || !currentHole) {
    return <div className="p-4 text-neutral-500">Loading round…</div>
  }

  const mapCenter = currentHole.teeCoords[tee.id] ?? { lat: currentHole.centerLat, lng: currentHole.centerLng }
  const pins: MapPin[] = [
    { id: 'hole', position: { lat: currentHole.centerLat, lng: currentHole.centerLng }, label: 'C', color: '#6b7280' },
  ]
  if (currentHole.greenLat && currentHole.greenLng) {
    pins.push({ id: 'green', position: { lat: currentHole.greenLat, lng: currentHole.greenLng }, label: '⛳', color: '#16a34a' })
  }
  if (myPos) pins.push({ id: 'me', position: myPos, label: '●', color: '#2563eb' })
  if (target) pins.push({ id: 'target', position: target, label: '🎯', color: '#dc2626' })

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-3 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          Hole {currentHole.number} · Par {currentHole.par}
        </h1>
        <span className="text-neutral-400 text-sm">{tee.name} tees</span>
      </div>

      {!puttMode ? (
        <>
          <div className="h-72 rounded-2xl overflow-hidden relative">
            <SatelliteMap center={mapCenter} pins={pins} onMapClick={(pos) => void handleTapTarget(pos)} />
            {locating && (
              <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                Locating…
              </div>
            )}
          </div>
          <p className="text-neutral-500 text-xs -mt-1">Tap the map where you're aiming to see the yardage.</p>

          {yardageLoading && <div className="text-neutral-400 text-sm">Calculating plays-like yardage…</div>}
          {playsLike && !yardageLoading && (
            <div className="bg-neutral-900 rounded-2xl p-4 flex flex-col gap-1">
              <div className="text-3xl font-bold text-white">{playsLike.playsLikeYards} yd plays like</div>
              <div className="text-neutral-500 text-sm">
                {playsLike.actualYards} yd straight ·{' '}
                {playsLike.elevationAdjustYards >= 0 ? '+' : ''}
                {playsLike.elevationAdjustYards} elevation ·{' '}
                {playsLike.windAdjustYards >= 0 ? '+' : ''}
                {playsLike.windAdjustYards} wind
              </div>
              <div className="text-neutral-600 text-xs">Estimate — not laser-precision.</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <BigButton onClick={handleMarkShot}>Mark my ball (+1)</BigButton>
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
          <div className="bg-neutral-900 rounded-2xl p-6 text-center">
            <div className="text-5xl font-bold text-white">{putts}</div>
            <div className="text-neutral-500 text-sm mt-1">putts this hole</div>
          </div>
          <BigButton onClick={addPutt}>+1 Putt</BigButton>
          <BigButton variant="danger" onClick={() => setShowPenaltyMenu(true)}>
            Lost / Hazard
          </BigButton>
        </div>
      )}

      <div className="bg-neutral-900 rounded-2xl p-4 flex justify-between items-center">
        <span className="text-neutral-400 text-sm">Strokes this hole</span>
        <span className="text-2xl font-bold text-white">{strokes}</span>
      </div>

      <BigButton onClick={finishHole} disabled={strokes === 0}>
        {currentHole.number === holesList.length ? 'Finish round' : 'Next hole'}
      </BigButton>

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

      {clubPromptFor && (
        <Modal onClose={() => assignClub(clubPromptFor, null)} title="Which club?">
          <div className="grid grid-cols-3 gap-2">
            {COMMON_CLUBS.map((club) => (
              <button
                key={club}
                onClick={() => assignClub(clubPromptFor, club)}
                className="min-h-12 rounded-xl bg-neutral-800 text-neutral-200 text-sm font-medium"
              >
                {club}
              </button>
            ))}
          </div>
          <button onClick={() => assignClub(clubPromptFor, null)} className="text-neutral-500 text-sm mt-3 underline">
            Skip
          </button>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-neutral-900 rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white font-semibold text-lg mb-3">{title}</div>
        {children}
      </div>
    </div>
  )
}
