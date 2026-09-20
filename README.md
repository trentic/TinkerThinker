# Fairway

A free, local-first golf GPS and scorekeeping PWA. No accounts, no paid APIs,
no backend — everything runs in the browser and lives on your device.

## What it does

- **Course setup**: search a location or use GPS, then tap the middle of
  each hole in order on a satellite view to build a bird's-eye course
  layout. OpenStreetMap golf tags are shown as a reference where available.
  Tee and green coordinates are captured automatically the first time you
  actually play each hole.
- **Scorecard photo import**: snap a photo of the physical scorecard and
  on-device OCR (Tesseract.js) drafts par/yardage/stroke-index per hole for
  you to review and correct.
- **Round tracking**: tap a target on the hole map to get a "plays like"
  yardage (straight-line distance adjusted for elevation and wind via
  Open-Meteo), mark your ball's position to log a stroke, or apply a
  lost-ball/hazard penalty in one tap. Putt mode switches to a simple putt
  counter once you're on the green.
- **Scorecard**: standard front-9/back-9/total layout, per-hole score vs.
  par, putts.
- **Stats**: scoring average, fairways hit, greens in regulation, putts per
  round, scrambling %, penalty breakdown, and a personal club-distance table
  built from your own GPS-tracked shots. No handicap index — course
  rating/slope data isn't available for free, so this intentionally sticks
  to raw stats rather than faking an "official" number.
- **Backup**: everything lives in IndexedDB on this device only. Settings
  has a one-tap JSON export/import so data survives a device reset or move
  to a new phone.

## Why it's free

- **Hosting**: any static host with a free tier (Vercel/Netlify/GitHub
  Pages) — it's a client-only PWA, no server required.
- **Maps**: MapLibre GL (open source) rendering Esri World Imagery satellite
  tiles (free, no API key).
- **Course data**: OpenStreetMap via the Overpass API (free) as a pre-fill,
  with the tap-to-map builder as the reliable fallback for any course.
- **Elevation & wind**: Open-Meteo (free, no API key).
- **Geocoding**: Nominatim (free, OpenStreetMap's geocoder).
- **OCR**: Tesseract.js, runs entirely client-side.

## Honest limitations

- "Plays like" yardage uses simple, well-known rules of thumb (elevation and
  wind adjustments), not real ballistic modeling — it's an estimate.
- Phone GPS is accurate to roughly 3–10m, worse under tree cover.
- OSM course coverage varies a lot by course/region; the tap-to-map builder
  is the thing that makes any course work, not just well-mapped ones.
- Scorecard OCR is a draft, not a guarantee — always reviewed before saving.
- No formal handicap index, by design (see Stats above).

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build
npm run lint     # oxlint
```
