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
  fetchSiblingCourses,
  getCurrentPosition,
  distanceMeters,
  type GeocodeResult,
  type OsmGolfFeature,
  type OsmBoundaryRef,
  type NearbyCourse,
  type LatLng,
} from '../lib/geo'
import { tryAutoMapHoles } from '../lib/courseAutoMap'
import {
  findParThreeCompanion,
  type ParThreeCompanion,
  type ParThreeCompanionCheck,
} from '../lib/parThreeDetection'
import { runScorecardOcr, type OcrDraftRow } from '../lib/scorecardOcr'

type Step = 'locate' | 'checking' | 'confirm' | 'map' | 'tees' | 'review'

const TEE_PRESETS = [
  { name: 'Black', color: '#111827' },
  { name: 'Blue', color: '#2563eb' },
  { name: 'White', color: '#e5e7eb' },
  { name: 'Gold', color: '#ca8a04' },
  { name: 'Red', color: '#dc2626' },
]

const ink = { color: 'var(--ink)' }
const inkSecondary = { color: 'var(--ink-secondary)' }
const inkMuted = { color: 'var(--ink-muted)' }
const amberText = { color: '#a15c00' }
const toggleOn = {
  background: 'linear-gradient(180deg, #8CF0A8 0%, #34C864 48%, #1E9E4A 100%)',
  boxShadow: '0 4px 10px rgba(20,120,60,0.35)',
  color: '#ffffff',
}
const toggleOff = { background: 'rgba(255,255,255,0.5)', color: 'var(--ink-muted)' }

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
  courseRating?: number
  slopeRating?: number
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
  // Par-3/executive companion check for a search result, keyed by that
  // result's index — populated asynchronously after results come in, since
  // it takes its own Overpass round-trip per result (see checkParThreeCompanions).
  const [parThreeChecks, setParThreeChecks] = useState<Record<number, ParThreeCompanionCheck>>({})
  const [searching, setSearching] = useState(false)
  const [findingNearby, setFindingNearby] = useState(false)
  const [nearbyNotice, setNearbyNotice] = useState<string | null>(null)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [findingManualCenter, setFindingManualCenter] = useState(false)
  // Set when fetchOsmGolfFeatures itself fails (network/Overpass error) —
  // distinct from OSM simply having no hole data for this course, so
  // "auto-map failed to check" doesn't look identical to "nothing to auto-map".
  const [autoMapCheckError, setAutoMapCheckError] = useState(false)
  const [retryingAutoMap, setRetryingAutoMap] = useState(false)
  const [lastLocationAttempt, setLastLocationAttempt] = useState<{ pos: LatLng; name?: string; boundary?: OsmBoundaryRef } | null>(null)
  const [center, setCenter] = useState<LatLng | null>(null)
  const [osmFeatures, setOsmFeatures] = useState<OsmGolfFeature[]>([])
  // Another OSM-mapped course at the same facility (e.g. the regulation
  // course's par-3/executive sibling) — offered as a switch, not forced.
  const [siblingCourse, setSiblingCourse] = useState<NearbyCourse | null>(null)
  const [dismissedSiblingNames, setDismissedSiblingNames] = useState<Set<string>>(new Set())
  // A course already saved on this device, close enough that this might be
  // the same place — catches facilities OSM doesn't separate at all.
  const [ownNearbyCourse, setOwnNearbyCourse] = useState<{
    id: string
    name: string
    distanceMeters: number
  } | null>(null)
  const [dismissedOwnCourseId, setDismissedOwnCourseId] = useState<string | null>(null)
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
      setTees(
        teeRecords.map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
          courseRating: t.courseRating,
          slopeRating: t.slopeRating,
        })),
      )
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
    setLocateError(null)
    try {
      const results = await searchCourseLocation(query)
      setSearchResults(results)
      if (results.length === 0) setLocateError("No matches found. Check the spelling, or map it manually below.")
      else checkParThreeCompanions(results)
    } catch {
      setLocateError("Couldn't reach the course search service — check your connection, or map it manually below.")
    } finally {
      setSearching(false)
    }
  }

  // Runs alongside the results list rather than blocking it — each check is
  // its own Overpass round-trip, so results appear immediately and a par-3
  // companion option (if any) pops in under its result once found. Capped
  // to the top 3 results to keep this to a reasonable number of requests.
  function checkParThreeCompanions(results: GeocodeResult[]) {
    setParThreeChecks({})
    results.slice(0, 3).forEach((r, i) => {
      findParThreeCompanion({ lat: r.lat, lng: r.lng }, r.boundary)
        .then((check) => setParThreeChecks((prev) => ({ ...prev, [i]: check })))
        .catch(() => {})
    })
  }

  async function selectLocation(pos: LatLng, name?: string, boundary?: OsmBoundaryRef) {
    setCenter(pos)
    if (name) setCourseName(name)
    setStep('checking')
    setAutoMapCheckError(false)
    setLastLocationAttempt({ pos, name, boundary })
    try {
      const features = await fetchOsmGolfFeatures(pos, { boundary })
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
      // The OSM check itself failed (network/Overpass hiccup) — distinct
      // from OSM genuinely having no hole data, which also lands here but
      // isn't an error. Flagged so "map" step can tell you which happened
      // instead of looking like auto-map just silently stopped working.
      setAutoMapCheckError(true)
      setOsmFeatures([])
      setHoles([])
      setStep('map')
    }
    void checkForSiblingCourse(pos, name)
    void checkForOwnNearbyCourse(pos)
  }

  async function retryAutoMapCheck() {
    if (!lastLocationAttempt) return
    setRetryingAutoMap(true)
    try {
      await selectLocation(lastLocationAttempt.pos, lastLocationAttempt.name, lastLocationAttempt.boundary)
    } finally {
      setRetryingAutoMap(false)
    }
  }

  // Picked straight from the search results — bypasses fetchOsmGolfFeatures
  // entirely since findParThreeCompanion already resolved the exact holes.
  function selectParThreeCompanion(mainName: string, companion: ParThreeCompanion) {
    const mappedHoleCount = companion.holes.length === 18 ? 18 : 9
    setAutoMapCheckError(false)
    setCenter(companion.center)
    setCourseName(`${mainName} — Par 3`)
    setHoleCount(mappedHoleCount)
    setOsmFeatures([])
    setHoles(
      companion.holes.map((h) => ({
        number: h.number,
        centerLat: h.center.lat,
        centerLng: h.center.lng,
        outline: h.outline,
        par: h.par ?? 3,
        yardageByTee: {},
      })),
    )
    setUsedAutoMap(true)
    setStep('confirm')
    void checkForOwnNearbyCourse(companion.center)
  }

  // Another named golf_course polygon close by (same facility, different
  // layout) — e.g. picking the regulation course when the par-3 course is
  // 200m away. Informational only: never blocks the flow, just offers a switch.
  async function checkForSiblingCourse(pos: LatLng, excludeName?: string) {
    try {
      const siblings = await fetchSiblingCourses(pos, excludeName)
      setSiblingCourse(siblings.find((s) => !dismissedSiblingNames.has(s.name)) ?? null)
    } catch {
      setSiblingCourse(null)
    }
  }

  async function switchToSibling(sibling: NearbyCourse) {
    setDismissedSiblingNames((prev) => new Set(prev).add(courseName))
    setSiblingCourse(null)
    await selectLocation(sibling.point, sibling.name, sibling.boundary)
  }

  function dismissSibling() {
    if (siblingCourse) setDismissedSiblingNames((prev) => new Set(prev).add(siblingCourse.name))
    setSiblingCourse(null)
  }

  // A course already saved on this device near this exact spot — catches
  // the case OSM sibling detection can't: two layouts sharing one
  // unseparated polygon, or a facility that isn't mapped as multiple
  // courses on OSM at all. Pure local lookup, works offline.
  async function checkForOwnNearbyCourse(pos: LatLng) {
    const existing = await db.courses.toArray()
    let closest: { id: string; name: string; distanceMeters: number } | null = null
    for (const c of existing) {
      if (isEditing && c.id === editingCourseId) continue
      if (c.id === dismissedOwnCourseId) continue
      const d = distanceMeters(pos, { lat: c.centerLat, lng: c.centerLng })
      if (d <= 500 && (!closest || d < closest.distanceMeters)) {
        closest = { id: c.id, name: c.name, distanceMeters: d }
      }
    }
    setOwnNearbyCourse(closest)
  }

  function confirmDifferentLayout() {
    if (ownNearbyCourse) setDismissedOwnCourseId(ownNearbyCourse.id)
    setOwnNearbyCourse(null)
  }

  async function useCurrentLocation() {
    setFindingNearby(true)
    setNearbyNotice(null)
    setLocateError(null)
    try {
      const pos = await getCurrentPosition()
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      try {
        const nearby = await fetchNearbyGolfCourses(here)
        if (nearby.length > 0) {
          const results = nearby.map((c) => ({
            // Comma-separated so the "pick a result" handler's
            // displayName.split(',')[0] pulls out just the course name,
            // matching how Nominatim's results are formatted.
            displayName: `${c.name}, ${(c.distanceMeters / 1000).toFixed(1)} km away`,
            lat: c.point.lat,
            lng: c.point.lng,
            boundary: c.boundary,
          }))
          setSearchResults(results)
          checkParThreeCompanions(results)
        } else {
          setNearbyNotice("No named courses found nearby on OpenStreetMap — using your exact location instead.")
          await selectLocation(here)
        }
      } catch {
        // Course lookup failed (offline/API down) but we do have a real
        // GPS fix — that's enough to map the course manually without it.
        setNearbyNotice("Couldn't search nearby courses (offline?) — using your exact location instead.")
        await selectLocation(here)
      }
    } catch {
      setLocateError("Couldn't get your location — check location permissions, or map it manually below.")
    } finally {
      setFindingNearby(false)
    }
  }

  // No network needed at all: just the device's own GPS fix as the map
  // center, for whenever search and "use current location"'s course
  // lookup are both unavailable (offline, API down, no signal).
  async function setUpManually() {
    setFindingManualCenter(true)
    setLocateError(null)
    setAutoMapCheckError(false)
    try {
      const pos = await getCurrentPosition()
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setCenter(here)
      setOsmFeatures([])
      setHoles([])
      setStep('map')
      void checkForOwnNearbyCourse(here)
    } catch {
      setLocateError('Could not get your location — check that location permissions are allowed for this site.')
    } finally {
      setFindingManualCenter(false)
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

  function updateTee(id: string, patch: Partial<DraftTee>) {
    setTees((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
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
        tees.map((t, i) => ({
          id: t.id,
          courseId,
          name: t.name,
          color: t.color,
          order: i,
          courseRating: t.courseRating,
          slopeRating: t.slopeRating,
        })),
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
      courseRating: t.courseRating,
      slopeRating: t.slopeRating,
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
    return (
      <div className="p-4" style={inkMuted}>
        Loading course…
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4 pb-24">
      <h1 className="text-2xl font-bold mt-2" style={ink}>
        {isEditing ? 'Edit course' : 'Add a course'}
      </h1>

      {siblingCourse && step !== 'locate' && step !== 'checking' && (
        <div className="glass-solid rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs" style={inkSecondary}>
            This facility also has <strong>{siblingCourse.name}</strong> mapped on OpenStreetMap, ~
            {Math.round(siblingCourse.distanceMeters)}m from here (maybe its par-3/executive course?). Is
            that the one you meant?
          </p>
          <div className="flex flex-wrap gap-2">
            <BigButton variant="secondary" onClick={() => void switchToSibling(siblingCourse)}>
              Switch to {siblingCourse.name}
            </BigButton>
            <BigButton variant="ghost" onClick={dismissSibling}>
              No, keep this one
            </BigButton>
          </div>
        </div>
      )}

      {ownNearbyCourse && step !== 'locate' && step !== 'checking' && (
        <div className="glass-solid rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs" style={amberText}>
            You already have <strong>{ownNearbyCourse.name}</strong> saved ~
            {Math.round(ownNearbyCourse.distanceMeters)}m from here.
          </p>
          <div className="flex flex-wrap gap-2">
            <BigButton variant="secondary" onClick={() => navigate(`/courses/${ownNearbyCourse.id}/edit`)}>
              Same course — edit it instead
            </BigButton>
            <BigButton variant="ghost" onClick={confirmDifferentLayout}>
              Different course at this location — keep adding
            </BigButton>
          </div>
        </div>
      )}

      {step === 'locate' && (
        <div className="flex flex-col gap-3">
          <input
            className="glass-solid rounded-xl px-4 py-3"
            style={ink}
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
          {nearbyNotice && (
            <p className="text-xs" style={amberText}>
              {nearbyNotice}
            </p>
          )}
          {locateError && (
            <div className="glass-solid rounded-xl p-3 flex flex-col gap-2">
              <p className="text-xs" style={amberText}>
                {locateError}
              </p>
              <BigButton variant="ghost" onClick={setUpManually} disabled={findingManualCenter}>
                {findingManualCenter ? 'Getting your location…' : "I'll map it myself"}
              </BigButton>
            </div>
          )}

          <div className="flex gap-2">
            {([9, 18] as const).map((n) => (
              <button
                key={n}
                onClick={() => setHoleCount(n)}
                className="flex-1 min-h-12 rounded-xl font-medium"
                style={holeCount === n ? toggleOn : toggleOff}
              >
                {n} holes
              </button>
            ))}
          </div>

          {searchResults.map((r, i) => {
            const mainName = r.displayName.split(',')[0]
            const check = parThreeChecks[i]
            const companion = check?.companion
            const leftoverTypes = check ? Object.entries(check.leftoverFeatureCounts) : []
            return (
              <div key={i} className="flex flex-col gap-2">
                <button
                  onClick={() => selectLocation({ lat: r.lat, lng: r.lng }, mainName, r.boundary)}
                  className="text-left glass rounded-xl p-3 text-sm"
                  style={inkSecondary}
                >
                  {r.displayName}
                </button>
                {companion && (
                  <button
                    onClick={() => selectParThreeCompanion(mainName, companion)}
                    className="text-left glass-solid rounded-xl p-3 ml-4"
                    style={inkSecondary}
                  >
                    <div className="text-sm font-semibold" style={ink}>
                      ⛳ Par 3 course ({companion.holes.length} holes)
                    </div>
                    <div className="text-xs" style={inkMuted}>
                      {mainName}
                    </div>
                  </button>
                )}
                {check && !companion && (
                  <p className="text-xs ml-4" style={inkMuted}>
                    {leftoverTypes.length === 0
                      ? 'No additional golf data found nearby on OpenStreetMap — no par-3 course to offer.'
                      : `Found extra OSM golf data nearby (${leftoverTypes
                          .map(([type, count]) => `${count} ${type}`)
                          .join(
                            ', ',
                          )}) but not a complete numbered course${
                          check.leftoverHoleRefs.length > 0
                            ? ` — hole refs seen: ${check.leftoverHoleRefs.join(', ')}`
                            : ''
                        }.`}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {step === 'checking' && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm" style={inkSecondary}>
            Checking OpenStreetMap for this course…
          </p>
        </div>
      )}

      {step === 'confirm' && center && (
        <div className="flex flex-col gap-3">
          <button onClick={() => setStep('locate')} className="self-start text-sm underline" style={inkSecondary}>
            ‹ Back
          </button>
          <p className="text-sm" style={inkSecondary}>
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
            className="self-start text-sm underline"
            style={inkSecondary}
          >
            ‹ Back
          </button>
          {autoMapCheckError && (
            <div className="glass-solid rounded-xl p-3 flex flex-col gap-2">
              <p className="text-xs" style={amberText}>
                Couldn't check OpenStreetMap for this course (site busy or a network hiccup) —
                that's different from OSM having no data. Worth trying again before mapping by
                hand.
              </p>
              <BigButton variant="secondary" onClick={retryAutoMapCheck} disabled={retryingAutoMap}>
                {retryingAutoMap ? 'Checking again…' : 'Try checking OpenStreetMap again'}
              </BigButton>
            </div>
          )}
          <p className="text-sm" style={inkSecondary}>
            Tap the middle of hole {holes.length + 1} on the satellite view, in playing order.
            Gray dots are OpenStreetMap's reference data for this area, if any exists.
          </p>
          <div className="h-96 rounded-2xl overflow-hidden">
            <SatelliteMap center={center} pins={[...osmPins, ...holePins]} onMapClick={addHoleTap} />
          </div>
          <div className="flex justify-between items-center">
            <span className="font-semibold" style={ink}>
              {holes.length} / {holeCount} holes placed
            </span>
            <button onClick={undoLastHole} className="text-sm underline" style={inkSecondary}>
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
              className="self-start text-sm underline"
              style={inkSecondary}
            >
              ‹ Back
            </button>
          )}
          <p className="text-sm" style={inkSecondary}>
            Which tee boxes does this course have?
          </p>
          <div className="flex flex-col gap-2">
            {tees.map((t) => (
              <div key={t.id} className="flex flex-col gap-2 glass rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="flex-1" style={ink}>
                    {t.name}
                  </span>
                  <button onClick={() => removeTee(t.id)} className="text-sm" style={inkMuted}>
                    Remove
                  </button>
                </div>
                <div className="flex items-center gap-2 pl-7">
                  <label className="flex items-center gap-1 text-xs" style={inkMuted}>
                    Course rating
                    <input
                      type="number"
                      step="0.1"
                      placeholder="72.0"
                      className="w-16 glass-solid rounded px-1 py-1 text-center"
                      style={ink}
                      value={t.courseRating ?? ''}
                      onChange={(e) =>
                        updateTee(t.id, { courseRating: e.target.value ? Number(e.target.value) : undefined })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs" style={inkMuted}>
                    Slope
                    <input
                      type="number"
                      placeholder="113"
                      className="w-16 glass-solid rounded px-1 py-1 text-center"
                      style={ink}
                      value={t.slopeRating ?? ''}
                      onChange={(e) =>
                        updateTee(t.id, { slopeRating: e.target.value ? Number(e.target.value) : undefined })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs" style={inkMuted}>
            Course/slope rating are optional — found on the scorecard. Set them to see an
            estimated Handicap Index in Stats.
          </p>
          <div className="flex flex-wrap gap-2">
            {TEE_PRESETS.filter((p) => !tees.some((t) => t.name === p.name)).map((p) => (
              <button
                key={p.name}
                onClick={() => addTee(p.name, p.color)}
                className="min-h-11 px-4 rounded-xl glass-solid text-sm font-medium"
                style={ink}
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
          <button onClick={() => setStep('tees')} className="self-start text-sm underline" style={inkSecondary}>
            ‹ Back
          </button>
          <input
            className="glass-solid rounded-xl px-4 py-3"
            style={ink}
            placeholder="Course name"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
          />

          <div className="glass rounded-2xl p-4 flex flex-col gap-3">
            <div className="font-semibold" style={ink}>
              Import from a scorecard photo (optional)
            </div>
            <p className="text-xs" style={inkMuted}>
              On-device OCR gives a draft — always double-check the numbers it fills in.
            </p>
            <div className="flex gap-2 flex-wrap">
              {tees.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTeeForYardage(t.id)}
                  className="min-h-10 px-3 rounded-lg text-sm font-medium"
                  style={activeTeeForYardage === t.id ? toggleOn : toggleOff}
                >
                  Yardage for {t.name}
                </button>
              ))}
            </div>
            <label
              className="min-h-14 rounded-xl glass-solid flex items-center justify-center font-medium cursor-pointer"
              style={ink}
            >
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
              <p className="text-xs" style={amberText}>
                Pick which tee box the photo's yardages are for first.
              </p>
            )}
            {ocrRows && (
              <div className="flex flex-col gap-2">
                <p className="text-xs" style={inkSecondary}>
                  Draft results — review before applying:
                </p>
                <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                  {ocrRows.map((r) => (
                    <div key={r.hole} className="flex gap-2 text-sm" style={inkSecondary}>
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
              <div key={h.number} className="glass rounded-xl p-3 flex items-center gap-3">
                <span className="font-semibold w-8" style={ink}>
                  #{h.number}
                </span>
                <label className="flex items-center gap-1 text-sm" style={inkSecondary}>
                  Par
                  <input
                    type="number"
                    className="w-12 glass-solid rounded px-1 py-1 text-center"
                    style={ink}
                    value={h.par}
                    onChange={(e) => updateHole(h.number, { par: Number(e.target.value) })}
                  />
                </label>
                {tees.map((t) => (
                  <label key={t.id} className="flex items-center gap-1 text-xs" style={inkSecondary}>
                    {t.name}
                    <input
                      type="number"
                      className="w-14 glass-solid rounded px-1 py-1 text-center"
                      style={ink}
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
