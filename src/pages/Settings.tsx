import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BigButton } from '../components/BigButton'
import { exportBackup, importBackup, getLastBackupAt } from '../db/backup'
import { db } from '../db/db'
import { COMMON_CLUBS } from '../lib/clubs'
import {
  isMulliganEnabled,
  setMulliganEnabled,
  isDebugLocationEnabled,
  setDebugLocationEnabled,
} from '../lib/settings'
import {
  isDriveConfigured,
  isDriveConnected,
  connectDrive,
  disconnectDrive,
  pushBackupToDrive,
  pullBackupFromDrive,
} from '../lib/googleDrive'

export function Settings() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const lastBackup = getLastBackupAt()
  const bagClubs = useLiveQuery(() => db.bagClubs.toArray(), [])
  const [mulliganEnabled, setMulliganEnabledState] = useState(isMulliganEnabled())
  const [debugLocationEnabled, setDebugLocationEnabledState] = useState(isDebugLocationEnabled())
  const [driveConnected, setDriveConnected] = useState(isDriveConnected())
  const [driveBusy, setDriveBusy] = useState(false)
  const [driveStatus, setDriveStatus] = useState<string | null>(null)

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

  function toggleDebugLocation() {
    const next = !debugLocationEnabled
    setDebugLocationEnabled(next)
    setDebugLocationEnabledState(next)
  }

  async function handleConnectDrive() {
    setDriveBusy(true)
    setDriveStatus(null)
    try {
      await connectDrive()
      setDriveConnected(true)
      setDriveStatus('Connected. Backing up now…')
      await pushBackupToDrive()
      setDriveStatus('Connected and backed up.')
    } catch (err) {
      setDriveStatus(err instanceof Error ? err.message : 'Could not connect to Google Drive.')
    } finally {
      setDriveBusy(false)
    }
  }

  function handleDisconnectDrive() {
    disconnectDrive()
    setDriveConnected(false)
    setDriveStatus('Disconnected. Local backups still work as before.')
  }

  async function handleBackupToDrive() {
    setDriveBusy(true)
    setDriveStatus(null)
    try {
      await pushBackupToDrive()
      setDriveStatus('Backed up to Drive.')
    } catch (err) {
      setDriveStatus(err instanceof Error ? err.message : 'Backup to Drive failed.')
    } finally {
      setDriveBusy(false)
    }
  }

  async function handlePullFromDrive() {
    setDriveBusy(true)
    setDriveStatus(null)
    try {
      const found = await pullBackupFromDrive(true)
      setDriveStatus(found ? 'Pulled the latest backup from Drive.' : 'No backup found on Drive yet.')
    } catch (err) {
      setDriveStatus(err instanceof Error ? err.message : 'Pull from Drive failed.')
    } finally {
      setDriveBusy(false)
    }
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

      <div className="bg-neutral-900 rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <div className="font-semibold text-white">Google Drive backup</div>
          {isDriveConfigured() ? (
            <p className="text-neutral-400 text-sm mt-1">
              Stores one plain-text file in your Drive and keeps updating that same file — it
              never creates extras. Pulls it automatically when you open the app, so a new
              device picks up where you left off.
            </p>
          ) : (
            <p className="text-neutral-400 text-sm mt-1">
              Not set up for this build. Whoever deployed the app needs to create a free Google
              OAuth Client ID and set it as <code>VITE_GOOGLE_CLIENT_ID</code> — see the README.
            </p>
          )}
        </div>

        {isDriveConfigured() && (
          <>
            {driveConnected ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <BigButton onClick={handleBackupToDrive} disabled={driveBusy}>
                    Back up now
                  </BigButton>
                  <BigButton variant="secondary" onClick={handlePullFromDrive} disabled={driveBusy}>
                    Pull latest
                  </BigButton>
                </div>
                <button
                  onClick={handleDisconnectDrive}
                  disabled={driveBusy}
                  className="text-neutral-500 text-sm underline"
                >
                  Disconnect Google Drive
                </button>
              </>
            ) : (
              <BigButton onClick={handleConnectDrive} disabled={driveBusy}>
                {driveBusy ? 'Connecting…' : 'Connect Google Drive'}
              </BigButton>
            )}
            {driveStatus && <p className="text-sm text-green-400">{driveStatus}</p>}
          </>
        )}
      </div>

      <div className="bg-amber-950/40 border border-amber-800 rounded-2xl p-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-amber-200">🐛 Debug: simulate location</div>
          <p className="text-amber-200/70 text-sm mt-1">
            Testing only. Replaces real GPS everywhere in the app with a position you control
            from a panel on the round screen — no need to actually be on a course. Turn this off
            when you're done, or every round you start will use fake positions.
          </p>
        </div>
        <button
          onClick={toggleDebugLocation}
          className={`min-h-10 px-4 rounded-full text-sm font-semibold shrink-0 ${
            debugLocationEnabled ? 'bg-amber-600 text-white' : 'bg-neutral-800 text-neutral-400'
          }`}
        >
          {debugLocationEnabled ? 'On' : 'Off'}
        </button>
      </div>
    </div>
  )
}
