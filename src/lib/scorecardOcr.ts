// On-device OCR of a photographed scorecard. Runs entirely in the browser
// (Tesseract.js/WASM) — no server, no cost. Table-structure parsing from a
// photo is inherently unreliable (angle, glare, font, layout differ per
// course), so this produces a best-effort draft that the user reviews and
// corrects, never a value that gets saved unconfirmed.

export interface OcrDraftRow {
  hole: number
  par?: number
  yardage?: number
  strokeIndex?: number
}

export interface OcrResult {
  rawText: string
  draftRows: OcrDraftRow[]
}

export async function runScorecardOcr(imageFile: File, holeCount: number): Promise<OcrResult> {
  const { recognize } = await import('tesseract.js')
  const { data } = await recognize(imageFile, 'eng')
  const rawText = data.text

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\d/.test(l))

  const draftRows: OcrDraftRow[] = Array.from({ length: holeCount }, (_, i) => ({ hole: i + 1 }))

  // Best-effort guess: if a line's first number matches the expected hole
  // number in sequence, treat the remaining numbers on that line as
  // [par, yardage, strokeIndex] in whatever order they appear. This works
  // reasonably on simple single-tee scorecards; multi-tee cards or unusual
  // layouts will need manual correction, which the review table is for.
  let holeCursor = 0
  for (const line of lines) {
    if (holeCursor >= holeCount) break
    const numbers = (line.match(/\d+/g) ?? []).map(Number)
    if (numbers.length === 0) continue

    const expectedHole = holeCursor + 1
    if (numbers[0] !== expectedHole) continue

    const rest = numbers.slice(1)
    const row = draftRows[holeCursor]
    const par = rest.find((n) => n >= 3 && n <= 6)
    const yardage = rest.find((n) => n >= 70 && n <= 650)
    const strokeIndex = rest.find((n) => n >= 1 && n <= 18 && n !== par)
    if (par !== undefined) row.par = par
    if (yardage !== undefined) row.yardage = yardage
    if (strokeIndex !== undefined) row.strokeIndex = strokeIndex

    holeCursor++
  }

  return { rawText, draftRows }
}
