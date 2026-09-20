import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BigButton } from '../components/BigButton'
import { SatelliteMap, type MapPin, type MapOutline } from '../components/SatelliteMap'
import { db, newId } from '../db/db'
import type { Hole, Tee } from '../db/schema'
import {
  searchCourseLocation,
  fetchOsmGolfFeatures,
  fetchNearbyGolfCourses,
  getCurrentPosition,
  type GeocodeResult,
  type OsmGolfFeature,
  type LatLng,
} from '../lib/geo'
import { tryAutoMapHoles } from '../lib/courseAutoMap'
import { runScorecardOcr, type OcrDraftRow } from '../lib/scorecardOcr'

type Step = 'locate' | 'checking' | 'confirm' | 'map' | 'tees' | 'review'

const TEE_PRESETS = [
  { name: 'Black', color: '#111827' },
  { name: 'Blue', color: '#2563eb' },
  { name: 'White', color: '#e5e7eb' },
  { name: 'Gold', color: '#ca8a04' },
  { name: 'Red', color: '#dc2626' },
]

interface DraftHole {
  id?: string // present when editing an existing hole; absent for a new tap
  number: number
  centerLat: number
  centerLng: number
  outline?: LatLng[]
  par: number
  strokeIndex?: number
  yardageByTee: Record<string, number>
}

interface DraftTee {
  id: string
  name: string
  color: string
}

export function CourseBuilder() {
  const navigate = useNavigate()
  const { courseId: editingCourseId } = useParams<{ courseId: string }>()
  const isEditing = !!editingCourseId
  const [step, setStep] = useState<Step>(isEditing ? 'tees' : 'locate')
  const [loadingExisting, setLoadingExisting] = useState(isEditing)
  const [courseName, setCourseName] = useState('')
  const [holeCount, setHoleCount] = useState<9 | 18>(18)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([])
  const [searching, setSearching] = useState(false)
  const [findingNearby, setFindingNearby] = useState(false)
  const [nearbyNotice, setNearbyNotice] = useState<string | null>(null)
  const [center, setCenter] = useState<LatLng | null>(null)
  const [osmFeatures, setOsmFeatures] = useState<OsmGolfFeature[]>([])
  const [holes, setHoles] = useState<DraftHole[]>([])
  const [tees, setTees] = useState<DraftTee[]>(
    isEditing ? [] : [{ id: newId(), name: 'White', color: '#e5e7eb' }],
  )
  const [originalTeeIds, setOriginalTeeIds] = useState<string[]>([])
  const [activeTeeForYardage, setActiveTeeForYardage] = useState<string | null>(null)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrRows, setOcrRows] = useState<OcrDraftRow[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [usedAutoMap, setUsedAutoMap] = useState(false)

  // Editing an existing course: load it in, skip straight past
  // location/mapping (that data already exists and this flow doesn't
  // touch it), and let the user adjust tee boxes and par/yardage.
  useEffect(() => {
    if (!editingCourseId) return
    ;(async () => {
      const [c, teeRecords, holeRecords] = await Promise.all([
        db.courses.get(editingCourseId),
        db.tees.where('courseId').equals(editingCourseId).sortBy('order'),
        db.holes.where('courseId').equals(editingCourseId).sortBy('number'),
      ])
      if (!c) {
        setLoadingExisting(false)
        return
      }
      setCourseName(c.name)
      setHoleCount(c.holeCount)
      setCenter({ lat: c.centerLat, lng: c.centerLng })
      setOriginalTeeIds(teeRecords.map((t) => t.id))
      setTees(teeRecords.map((t) => ({ id: t.id, name: t.name, color: t.color })))
      setHoles(
        holeRecords.map((h) => ({
          id: h.id,
          number: h.number,
          centerLat: h.centerLat,
          centerLng: h.centerLng,
          outline: h.outline,
          par: h.par,
          strokeIndex: h.strokeIndex,
          yardageByTee: h.yardageByTee,
        })),
      )
      setLoadingExisting(false)
    })()
  }, [editingCourseId])

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    try {
      setSearchResults(await searchCourseLocation(query))
    } finally {
      setSearching(false)
    }
  }

  async function selectLocation(pos: LatLng, name?: string) {
    setCenter(pos)
    if (name) setCourseName(name)
    setStep('checking')
    try {
      const features = await fetchOsmGolfFeatures(pos)
      setOsmFeatures(features)
      const auto = tryAutoMapHoles(features, holeCount)
      if (auto) {
        setHoles(
          auto.map((h) => ({
            number: h.number,
            centerLat: h.center.lat,
            centerLng: h.center.lng,
            outline: h.outline,
            par: h.par ?? 4,
            yardageByTee: {},
          })),
        )
        setStep('confirm')
      } else {
        setHoles([])
        setStep('map')
      }
    } catch {
      setOsmFeatures([])
      setHoles([])
      setStep('map')
    }
  }

  async function useCurrentLocation() {
    setFindingNearby(true)
    setNearbyNotice(null)
    try {
      const pos = await getCurrentPosition()
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      const nearby = await fetchNearbyGolfCourses(here)
      if (nearby.length > 0) {
        setSearchResults(
          nearby.map((c) => ({
            // Comma-separated so the "pick a result" handler's
            // displayName.split(',')[0] pulls out just the course name,
            // matching how Nominatim's results are formatted.
            displayName: `${c.name}, ${(c.distanceMeters / 1000).toFixed(1)} km away`,
            lat: c.point.lat,
            lng: c.point.lng,
          })),
        )
      } else {
        setNearbyNotice("No named courses found nearby on OpenStreetMap — using your exact location instead.")
        await selectLocation(here)
      }
    } finally {
      setFindingNearby(false)
    }
  }

  function acceptAutoMap() {
    setUsedAutoMap(true)
    setStep('tees')
  }

  function rejectAutoMap() {
    setUsedAutoMap(false)
    setHoles([])
    setStep('map')
  }

  function addHoleTap(pos: LatLng) {
    if (holes.length >= holeCount) return
    setHoles((prev) => [
      ...prev,
      {
        number: prev.length + 1,
        centerLat: pos.lat,
        centerLng: pos.lng,
        par: 4,
        yardageByTee: {},
      },
    ])
  }

  function undoLastHole() {
    setHoles((prev) => prev.slice(0, -1))
  }

  function updateHole(number: number, patch: Partial<DraftHole>) {
    setHoles((prev) => prev.map((h) => (h.number === number ? { ...h, ...patch } : h)))
  }

  function addTee(name: string, color: string) {
    if (tees.some((t) => t.name === name)) return
    setTees((prev) => [...prev, { id: newId(), name, color }])
  }

  function removeTee(id: string) {
    setTees((prev) => prev.filter((t) => t.id !== id))
  }

  async function handleOcrUpload(file: File) {
    setOcrBusy(true)
    try {
      const result = await runScorecardOcr(file, holeCount)
      setOcrRows(result.draftRows)
    } finally {
      setOcrBusy(false)
    }
  }

  function applyOcrRows() {
    if (!ocrRows || !activeTeeForYardage) return
    setHoles((prev) =>
      prev.map((h) => {
        const row = ocrRows.find((r) => r.hole === h.number)
        if (!row) return h
        return {
          ...h,
          par: row.par ?? h.par,
          strokeIndex: row.strokeIndex ?? h.strokeIndex,
          yardageByTee: row.yardage
            ? { ...h.yardageByTee, [activeTeeForYardage]: row.yardage }
            : h.yardageByTee,
        }
      }),
    )
    setOcrRows(null)
  }

  async function saveCourseEdits(courseId: string) {
    await db.transaction('rw', [db.courses, db.tees, db.holes], async () => {
      await db.courses.update(courseId, { name: courseName.trim() || 'Unnamed course' })

      const keptTeeIds = new Set(tees.map((t) => t.id))
      const removedTeeIds = originalTeeIds.filter((id) => !keptTeeIds.has(id))
      if (removedTeeIds.length > 0) await db.tees.bulkDelete(removedTeeIds)
      await db.tees.bulkPut(
        tees.map((t, i) => ({ id: t.id, courseId, name: t.name, color: t.color, order: i })),
      )

      // Partial updates only — this deliberately leaves centerLat/Lng,
      // outline, teeCoords, and green location untouched, since those come
      // from mapping/real play, not from this editable form.
      for (const h of holes) {
        if (!h.id) continue
        await db.holes.update(h.id, { par: h.par, strokeIndex: h.strokeIndex, yardageByTee: h.yardageByTee })
      }
    })
  }

  async function createCourse() {
    if (!center) return
    const courseId = newId()
    await db.courses.add({
      id: courseId,
      name: courseName.trim() || 'Unnamed course',
      centerLat: center.lat,
      centerLng: center.lng,
      holeCount,
      source: usedAutoMap ? 'osm' : osmFeatures.length > 0 ? 'mixed' : 'manual',
      createdAt: Date.now(),
    })

    const teeRecords: Tee[] = tees.map((t, i) => ({
      id: t.id,
      courseId,
      name: t.name,
      color: t.color,
      order: i,
    }))
    await db.tees.bulkAdd(teeRecords)

    const holeRecords: Hole[] = holes.map((h) => ({
      id: newId(),
      courseId,
      number: h.number,
      par: h.par,
      strokeIndex: h.strokeIndex,
      centerLat: h.centerLat,
      centerLng: h.centerLng,
      outline: h.outline,
      teeCoords: {},
      yardageByTee: h.yardageByTee,
    }))
    await db.holes.bulkAdd(holeRecords)
  }

  async function saveCourse() {
    if (!center || tees.length === 0) return
    if (!isEditing && holes.length !== holeCount) return
    setSaving(true)
    try {
      if (isEditing && editingCourseId) {
        await saveCourseEdits(editingCourseId)
      } else {
        await createCourse()
      }
      navigate('/')
    } finally {
      setSaving(false)
    }
  }

  const holePins: MapPin[] = holes.map((h) => ({
    id: String(h.number),
    position: { lat: h.centerLat, lng: h.centerLng },
    label: String(h.number),
    color: '#16a34a',
  }))
  const holeOutlines: MapOutline[] = holes
    .filter((h): h is DraftHole & { outline: LatLng[] } => !!h.outline)
    .map((h) => ({ id: `outline-${h.number}`, coordinates: h.outline, color: '#f59e0b' }))
  const osmPins: MapPin[] = osmFeatures
    .filter((f) => f.type === 'hole' || f.type === 'green' || f.type === 'tee')
    .map((f, i) => ({
      id: `osm-${i}`,
      position: f.point,
      label: f.ref ?? '·',
      color: '#6b7280',
    }))

  if (loadingExisting) {
    return <div className="p-4 text-neutral-500">Loading course…</div>
  }

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4 pb-24">
      <h1 className="text-2xl font-bold text-white mt-2">{isEditing ? 'Edit course' : 'Add a course'}</h1>

      {step === 'locate' && (
        <div className="flex flex-col gap-3">
          <input
            className="bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white"
            placeholder="Course name or nearby address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <BigButton onClick={handleSearch} disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </BigButton>
          <BigButton variant="secondary" onClick={useCurrentLocation} disabled={findingNearby}>
            {findingNearby ? 'Finding nearby courses…' : 'Use my current location'}
          </BigButton>
          {nearbyNotice && <p className="text-amber-400 text-xs">{nearbyNotice}</p>}

          <div className="flex gap-2">
            {([9, 18] as const).map((n) => (
              <button
                key={n}
                onClick={() => setHoleCount(n)}
                className={`flex-1 min-h-12 rounded-xl font-medium ${
                  holeCount === n ? 'bg-green-600 text-white' : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                {n} holes
              </button>
            ))}
          </div>

          {searchResults.map((r, i) => (
            <button
              key={i}
              onClick={() => selectLocation({ lat: r.lat, lng: r.lng }, r.displayName.split(',')[0])}
              className="text-left bg-neutral-900 rounded-xl p-3 text-sm text-neutral-300"
            >
              {r.displayName}
            </button>
          ))}
        </div>
      )}

      {step === 'checking' && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-neutral-400 text-sm">Checking OpenStreetMap for this course…</p>
        </div>
      )}

      {step === 'confirm' && center && (
        <div className="flex flex-col gap-3">
          <button onClick={() => setStep('locate')} className="self-start text-neutral-400 text-sm underline">
            ‹ Back
          </button>
          <p className="text-neutral-400 text-sm">
            OpenStreetMap already has all {holeCount} holes mapped for this course.{' '}
            {holeOutlines.length > 0
              ? 'The amber lines are what OSM traced for each hole — check that it looks right before using it.'
              : "OSM only has a center point for each hole here, not a traced outline, so you'll just see numbered pins — check the numbering and positions look right."}
          </p>
          <div className="h-96 rounded-2xl overflow-hidden">
            <SatelliteMap center={center} pins={holePins} outlines={holeOutlines} />
          </div>
          <BigButton onClick={acceptAutoMap}>Looks right → tee boxes</BigButton>
          <BigButton variant="secondary" onClick={rejectAutoMap}>
            Incorrect? Tap here to map manually
          </BigButton>
        </div>
      )}

      {step === 'map' && center && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              setHoles([])
              setStep('locate')
            }}
            className="self-start text-neutral-400 text-sm underline"
          >
            ‹ Back
          </button>
          <p className="text-neutral-400 text-sm">
            Tap the middle of hole {holes.length + 1} on the satellite view, in playing order.
            Gray dots are OpenStreetMap's reference data for this area, if any exists.
          </p>
          <div className="h-96 rounded-2xl overflow-hidden">
            <SatelliteMap center={center} pins={[...osmPins, ...holePins]} onMapClick={addHoleTap} />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white font-semibold">
              {holes.length} / {holeCount} holes placed
            </span>
            <button onClick={undoLastHole} className="text-neutral-400 text-sm underline">
              Undo last
            </button>
          </div>
          <BigButton disabled={holes.length !== holeCount} onClick={() => setStep('tees')}>
            Next: tee boxes
          </BigButton>
        </div>
      )}

      {step === 'tees' && (
        <div className="flex flex-col gap-3">
          {!isEditing && (
            <button
              onClick={() => setStep(usedAutoMap ? 'confirm' : 'map')}
              className="self-start text-neutral-400 text-sm underline"
            >
              ‹ Back
            </button>
          )}
          <p className="text-neutral-400 text-sm">Which tee boxes does this course have?</p>
          <div className="flex flex-col gap-2">
            {tees.map((t) => (
              <div key={t.id} className="flex items-center gap-3 bg-neutral-900 rounded-xl p-3">
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-white flex-1">{t.name}</span>
                <button onClick={() => removeTee(t.id)} className="text-neutral-500 text-sm">
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {TEE_PRESETS.filter((p) => !tees.some((t) => t.name === p.name)).map((p) => (
              <button
                key={p.name}
                onClick={() => addTee(p.name, p.color)}
                className="min-h-11 px-4 rounded-xl bg-neutral-800 text-neutral-200 text-sm font-medium"
              >
                + {p.name}
              </button>
            ))}
          </div>
          <BigButton disabled={tees.length === 0} onClick={() => setStep('review')}>
            Next: par & yardage
          </BigButton>
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-4">
          <button onClick={() => setStep('tees')} className="self-start text-neutral-400 text-sm underline">
            ‹ Back
          </button>
          <input
            className="bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white"
            placeholder="Course name"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
          />

          <div className="bg-neutral-900 rounded-2xl p-4 flex flex-col gap-3">
            <div className="font-semibold text-white">Import from a scorecard photo (optional)</div>
            <p className="text-neutral-500 text-xs">
              On-device OCR gives a draft — always double-check the numbers it fills in.
            </p>
            <div className="flex gap-2 flex-wrap">
              {tees.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTeeForYardage(t.id)}
                  className={`min-h-10 px-3 rounded-lg text-sm font-medium ${
                    activeTeeForYardage === t.id ? 'bg-green-600 text-white' : 'bg-neutral-800 text-neutral-300'
                  }`}
                >
                  Yardage for {t.name}
                </button>
              ))}
            </div>
            <label className="min-h-14 rounded-xl bg-neutral-800 text-neutral-200 flex items-center justify-center font-medium cursor-pointer">
              {ocrBusy ? 'Reading scorecard…' : 'Take/upload scorecard photo'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={!activeTeeForYardage || ocrBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleOcrUpload(file)
                }}
              />
            </label>
            {!activeTeeForYardage && (
              <p className="text-amber-400 text-xs">Pick which tee box the photo's yardages are for first.</p>
            )}
            {ocrRows && (
              <div className="flex flex-col gap-2">
                <p className="text-neutral-400 text-xs">Draft results — review before applying:</p>
                <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                  {ocrRows.map((r) => (
                    <div key={r.hole} className="flex gap-2 text-sm text-neutral-300">
                      <span className="w-10">#{r.hole}</span>
                      <span className="w-16">Par {r.par ?? '?'}</span>
                      <span className="w-20">{r.yardage ?? '?'} yd</span>
                      <span>SI {r.strokeIndex ?? '?'}</span>
                    </div>
                  ))}
                </div>
                <BigButton onClick={applyOcrRows}>Apply to holes</BigButton>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {holes.map((h) => (
              <div key={h.number} className="bg-neutral-900 rounded-xl p-3 flex items-center gap-3">
                <span className="text-white font-semibold w-8">#{h.number}</span>
                <label className="flex items-center gap-1 text-neutral-400 text-sm">
                  Par
                  <input
                    type="number"
                    className="w-12 bg-neutral-800 rounded px-1 py-1 text-white text-center"
                    value={h.par}
                    onChange={(e) => updateHole(h.number, { par: Number(e.target.value) })}
                  />
                </label>
                {tees.map((t) => (
                  <label key={t.id} className="flex items-center gap-1 text-neutral-400 text-xs">
                    {t.name}
                    <input
                      type="number"
                      className="w-14 bg-neutral-800 rounded px-1 py-1 text-white text-center"
                      value={h.yardageByTee[t.id] ?? ''}
                      onChange={(e) =>
                        updateHole(h.number, {
                          yardageByTee: { ...h.yardageByTee, [t.id]: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>

          <BigButton onClick={saveCourse} disabled={saving}>
            {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Save course'}
          </BigButton>
        </div>
      )}
    </div>
  )
}
