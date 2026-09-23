import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BigButton } from '../components/BigButton'
import { OnboardingTutorial } from '../components/OnboardingTutorial'
import { exportBackup, importBackup, getLastBackupAt } from '../db/backup'
import { db } from '../db/db'
import { COMMON_CLUBS } from '../lib/clubs'
import { buildLabel } from '../lib/buildInfo'
import {
  isMulliganEnabled,
  setMulliganEnabled,
  isDebugLocationEnabled,
  setDebugLocationEnabled,
  isBgAnimationEnabled,
  setBgAnimationEnabled,
  setOnboardingSeen,
} from '../lib/settings'
import {
  isDriveConfigured,
  isDriveConnected,
  connectDrive,
  disconnectDrive,
  pushBackupToDrive,
  pullBackupFromDrive,
} from '../lib/googleDrive'

const TOGGLE_ON = 'text-white'
const TOGGLE_OFF_STYLE = { background: 'rgba(255,255,255,0.5)', color: 'var(--ink-muted)' }
const TOGGLE_ON_STYLE = {
  background: 'linear-gradient(180deg, #8CF0A8 0%, #34C864 48%, #1E9E4A 100%)',
  boxShadow: '0 4px 10px rgba(20,120,60,0.35)',
}

export function Settings() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const lastBackup = getLastBackupAt()
  const bagClubs = useLiveQuery(() => db.bagClubs.toArray(), [])
  const [mulliganEnabled, setMulliganEnabledState] = useState(isMulliganEnabled())
  const [debugLocationEnabled, setDebugLocationEnabledState] = useState(isDebugLocationEnabled())
  const [bgAnimationEnabled, setBgAnimationEnabledState] = useState(isBgAnimationEnabled())
  const [driveConnected, setDriveConnected] = useState(isDriveConnected())
  const [driveBusy, setDriveBusy] = useState(false)
  const [driveStatus, setDriveStatus] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

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

  function toggleBgAnimation() {
    const next = !bgAnimationEnabled
    setBgAnimationEnabled(next)
    setBgAnimationEnabledState(next)
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
      <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--ink)' }}>
        Settings
      </h1>

      <div className="glass rounded-2xl p-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold" style={{ color: 'var(--ink)' }}>
            How scoring works
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-secondary)' }}>
            A quick refresher on par, strokes, and reading your score.
          </p>
        </div>
        <BigButton variant="secondary" onClick={() => setShowOnboarding(true)} className="shrink-0">
          Show me
        </BigButton>
      </div>

      <div className="glass rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <div className="font-semibold" style={{ color: 'var(--ink)' }}>
            My bag
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-secondary)' }}>
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
                  className={`min-h-11 flex-1 px-3 rounded-xl text-sm font-medium text-left ${entry.inBag ? TOGGLE_ON : ''}`}
                  style={entry.inBag ? TOGGLE_ON_STYLE : TOGGLE_OFF_STYLE}
                >
                  {club}
                </button>
                {entry.inBag && (
                  <input
                    type="number"
                    placeholder="yards"
                    className="w-20 glass-solid rounded-lg px-2 py-2 text-center text-sm"
                    style={{ color: 'var(--ink)' }}
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

      <div className="glass rounded-2xl p-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold" style={{ color: 'var(--ink)' }}>
            Mulligan button
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-secondary)' }}>
            Shows an undo button during a round to redo the last stroke without a penalty.
          </p>
        </div>
        <button
          onClick={toggleMulligan}
          className={`min-h-10 px-4 rounded-full text-sm font-semibold shrink-0 ${mulliganEnabled ? TOGGLE_ON : ''}`}
          style={mulliganEnabled ? TOGGLE_ON_STYLE : TOGGLE_OFF_STYLE}
        >
          {mulliganEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="glass rounded-2xl p-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold" style={{ color: 'var(--ink)' }}>
            Animated background
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-secondary)' }}>
            The slow-drifting background. Turn it off to save battery.
          </p>
        </div>
        <button
          onClick={toggleBgAnimation}
          className={`min-h-10 px-4 rounded-full text-sm font-semibold shrink-0 ${bgAnimationEnabled ? TOGGLE_ON : ''}`}
          style={bgAnimationEnabled ? TOGGLE_ON_STYLE : TOGGLE_OFF_STYLE}
        >
          {bgAnimationEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="glass rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <div className="font-semibold" style={{ color: 'var(--ink)' }}>
            Backup & restore
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-secondary)' }}>
            Everything is stored only on this device. Back up regularly, and restore after a
            reset or on a new device.
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>
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
        {status && (
          <p className="text-sm" style={{ color: 'var(--color-green)' }}>
            {status}
          </p>
        )}
      </div>

      <div className="glass rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <div className="font-semibold" style={{ color: 'var(--ink)' }}>
            Google Drive backup
          </div>
          {isDriveConfigured() ? (
            <p className="text-sm mt-1" style={{ color: 'var(--ink-secondary)' }}>
              Stores one plain-text file in your Drive and keeps updating that same file — it
              never creates extras. Pulls it automatically when you open the app, so a new
              device picks up where you left off.
            </p>
          ) : (
            <p className="text-sm mt-1" style={{ color: 'var(--ink-secondary)' }}>
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
                  className="text-sm underline"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  Disconnect Google Drive
                </button>
              </>
            ) : (
              <BigButton onClick={handleConnectDrive} disabled={driveBusy}>
                {driveBusy ? 'Connecting…' : 'Connect Google Drive'}
              </BigButton>
            )}
            {driveStatus && (
              <p className="text-sm" style={{ color: 'var(--color-green)' }}>
                {driveStatus}
              </p>
            )}
          </>
        )}
      </div>

      <div className="glass-solid rounded-2xl p-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold" style={{ color: '#8a5a12' }}>
            Debug: simulate location
          </div>
          <p className="text-sm mt-1" style={{ color: '#8a5a12', opacity: 0.75 }}>
            Testing only. Replaces real GPS everywhere in the app with a position you control
            from a panel on the round screen — no need to actually be on a course. Turn this off
            when you're done, or every round you start will use fake positions.
          </p>
        </div>
        <button
          onClick={toggleDebugLocation}
          className="min-h-10 px-4 rounded-full text-sm font-semibold shrink-0"
          style={
            debugLocationEnabled
              ? { background: 'linear-gradient(180deg, #FFD08A, #E8A020)', color: '#5c3a00' }
              : TOGGLE_OFF_STYLE
          }
        >
          {debugLocationEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <p className="text-xs text-center" style={{ color: 'var(--ink-muted)' }}>
        {buildLabel()}
      </p>

      {showOnboarding && (
        <OnboardingTutorial
          onDone={() => {
            setOnboardingSeen(true)
            setShowOnboarding(false)
          }}
        />
      )}
    </div>
  )
}
