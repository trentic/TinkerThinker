import { useRef, useState } from 'react'
import { BigButton } from '../components/BigButton'
import { exportBackup, importBackup, getLastBackupAt } from '../db/backup'

export function Settings() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const lastBackup = getLastBackupAt()

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

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-white mt-2">Settings</h1>

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
