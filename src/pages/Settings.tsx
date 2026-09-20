import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BigButton } from '../components/BigButton'
import { exportBackup, importBackup, getLastBackupAt } from '../db/backup'
import { db } from '../db/db'
import { COMMON_CLUBS } from '../lib/clubs'
import { isMulliganEnabled, setMulliganEnabled } from '../lib/settings'

export function Settings() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const lastBackup = getLastBackupAt()
  const bagClubs = useLiveQuery(() => db.bagClubs.toArray(), [])
  const [mulliganEnabled, setMulliganEnabledState] = useState(isMulliganEnabled())

  async function handleExport() {
    await exportBackup()
    setStatus('Backup downloaded. Save it somewhere safe — Drive, iCloud, email to yourself.')
  }

  async function handleImportFile(file: File) {
    try {
      await importBackup(file)
      setStatus('Backup restored.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  function bagEntry(club: string) {
    return bagClubs?.find((c) => c.club === club) ?? { club, inBag: false, manualYardage: undefined }
  }

  async function toggleInBag(club: string) {
    const entry = bagEntry(club)
    await db.bagClubs.put({ ...entry, inBag: !entry.inBag })
  }

  async function setManualYardage(club: string, yardage: number | undefined) {
    const entry = bagEntry(club)
    await db.bagClubs.put({ ...entry, manualYardage: yardage })
  }

  function toggleMulligan() {
    const next = !mulliganEnabled
    setMulliganEnabled(next)
    setMulliganEnabledState(next)
  }

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-white mt-2">Settings</h1>

      <div className="bg-neutral-900 rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <div className="font-semibold text-white">My bag</div>
          <p className="text-neutral-400 text-sm mt-1">
            Pick the clubs you carry. If you already know a club's yardage, type it in — it'll
            show up in Stats until your real GPS-tracked shots take over.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {COMMON_CLUBS.map((club) => {
            const entry = bagEntry(club)
            return (
              <div key={club} className="flex items-center gap-3">
                <button
                  onClick={() => toggleInBag(club)}
                  className={`min-h-11 flex-1 px-3 rounded-xl text-sm font-medium text-left ${
                    entry.inBag ? 'bg-green-600 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {club}
                </button>
                {entry.inBag && (
                  <input
                    type="number"
                    placeholder="yards"
                    className="w-20 bg-neutral-800 rounded-lg px-2 py-2 text-white text-center text-sm"
                    value={entry.manualYardage ?? ''}
                    onChange={(e) =>
                      setManualYardage(club, e.target.value === '' ? undefined : Number(e.target.value))
                    }
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-neutral-900 rounded-2xl p-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-white">Mulligan button</div>
          <p className="text-neutral-400 text-sm mt-1">
            Shows an undo button during a round to redo the last stroke without a penalty.
          </p>
        </div>
        <button
          onClick={toggleMulligan}
          className={`min-h-10 px-4 rounded-full text-sm font-semibold shrink-0 ${
            mulliganEnabled ? 'bg-green-600 text-white' : 'bg-neutral-800 text-neutral-400'
          }`}
        >
          {mulliganEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="bg-neutral-900 rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <div className="font-semibold text-white">Backup & restore</div>
          <p className="text-neutral-400 text-sm mt-1">
            Everything is stored only on this device. Back up regularly, and restore after a
            reset or on a new device.
          </p>
          <p className="text-neutral-500 text-xs mt-1">
            Last backup: {lastBackup ? new Date(lastBackup).toLocaleString() : 'never'}
          </p>
        </div>
        <BigButton onClick={handleExport}>Download backup</BigButton>
        <BigButton variant="secondary" onClick={() => fileInput.current?.click()}>
          Restore from backup file
        </BigButton>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImportFile(file)
          }}
        />
        {status && <p className="text-sm text-green-400">{status}</p>}
      </div>
    </div>
  )
}
