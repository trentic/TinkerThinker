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
  to a new phone, plus an optional Google Drive connection (see below) that
  keeps a single backup file in sync automatically.

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

## Optional: Google Drive backup

Local backup/restore (Settings > Backup & restore) needs nothing set up and
always works. Google Drive sync is optional and needs a one-time, free setup
because Drive access always requires an OAuth client — that's inherent to
how Drive works for any app, not a cost we're choosing to pay around:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project (or use an existing one) — no billing account needed.
2. APIs & Services > Library > enable the **Google Drive API**.
3. APIs & Services > OAuth consent screen > External > fill in the basics,
   add the `drive.file` scope, and add your own Google account (and anyone
   else you want using this) as a **test user**. Leave the app in "Testing"
   status — you never need to submit it for verification for personal use.
4. APIs & Services > Credentials > Create Credentials > OAuth client ID >
   Web application. Add your deployed origin(s) as Authorized JavaScript
   origins, e.g. `https://trentic.github.io` (the origin only, not the
   `/TinkerThinker/` path) and `http://localhost:5173` for local dev.
5. Copy the generated Client ID and set it as `VITE_GOOGLE_CLIENT_ID` in a
   `.env` file (or your host's build-time env vars), then rebuild/redeploy.

Once configured, Settings shows a "Connect Google Drive" button. It stores
exactly one plain-text JSON file in Drive (`fairway-backup.json`) and always
updates that same file — it never creates duplicates. Sync is automatic in
both directions, silently and best-effort: the app pulls on every open, and
pushes right after a round is finished, merging by record ID so it can only
add/update data, never delete anything. "Back up now"/"Pull latest" in
Settings are still there for pushing mid-round changes (bag edits, manual
score fixes) or forcing a sync on demand.

One real limitation: without a backend there's no refresh token, so silent
re-auth depends on the browser allowing Google's background sign-in check.
That's unreliable in Safari/iOS due to third-party storage restrictions, so
on iPhone this will often need an interactive "Connect" tap once per
session rather than fully invisible sync.

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
