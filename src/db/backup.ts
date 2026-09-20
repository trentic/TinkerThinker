import { db } from './db'

const BACKUP_VERSION = 1
const LAST_BACKUP_KEY = 'fairway:lastBackupAt'

interface BackupFile {
  version: number
  exportedAt: number
  courses: unknown[]
  tees: unknown[]
  holes: unknown[]
  rounds: unknown[]
  holeScores: unknown[]
  shots: unknown[]
}

export async function exportBackup(): Promise<void> {
  const [courses, tees, holes, rounds, holeScores, shots] = await Promise.all([
    db.courses.toArray(),
    db.tees.toArray(),
    db.holes.toArray(),
    db.rounds.toArray(),
    db.holeScores.toArray(),
    db.shots.toArray(),
  ])

  const payload: BackupFile = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    courses,
    tees,
    holes,
    rounds,
    holeScores,
    shots,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `fairway-backup-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)

  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()))
}

export async function importBackup(file: File): Promise<void> {
  const text = await file.text()
  const payload = JSON.parse(text) as BackupFile

  if (payload.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${payload.version}`)
  }

  await db.transaction(
    'rw',
    [db.courses, db.tees, db.holes, db.rounds, db.holeScores, db.shots],
    async () => {
      // bulkPut merges by primary key rather than wiping existing data,
      // so importing a partial/older backup on top of a newer device is safe.
      await db.courses.bulkPut(payload.courses as never[])
      await db.tees.bulkPut(payload.tees as never[])
      await db.holes.bulkPut(payload.holes as never[])
      await db.rounds.bulkPut(payload.rounds as never[])
      await db.holeScores.bulkPut(payload.holeScores as never[])
      await db.shots.bulkPut(payload.shots as never[])
    },
  )

  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()))
}

export function getLastBackupAt(): number | null {
  const raw = localStorage.getItem(LAST_BACKUP_KEY)
  return raw ? Number(raw) : null
}

export function daysSinceLastBackup(): number | null {
  const last = getLastBackupAt()
  if (last === null) return null
  return Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24))
}
