// Optional Google Drive backup, built on Google Identity Services (GIS) —
// free, client-only OAuth with no backend. Requires the person deploying
// this app to create their own free OAuth Client ID in Google Cloud Console
// (see README) and set it as VITE_GOOGLE_CLIENT_ID at build time; there's no
// way around that step, it's inherent to how Drive access works for any
// app, not a cost issue. Uses the narrow `drive.file` scope, so the app can
// only see files it creates itself — never the rest of anyone's Drive.
//
// Honest limitation: without a backend there's no refresh token, and GIS's
// token client always briefly pops a window when asked for one — even for
// a "silent" request — so this caches the access token across page loads
// (see cachedToken below) to keep that from happening on every reload. A
// fresh token is only fetched once it actually expires (~hourly) or after
// the cache is cleared, and on Safari/iOS that fetch can fail silently due
// to third-party storage restrictions, needing an interactive "Connect"
// tap instead of truly invisible sync.

import { buildBackupPayload, mergeBackupPayload, type BackupFile } from '../db/backup'

interface TokenResponse {
  access_token?: string
  error?: string
  expires_in?: number
}

interface TokenClient {
  callback: (resp: TokenResponse) => void
  requestAccessToken: (opts?: { prompt?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (resp: TokenResponse) => void
          }) => TokenClient
          revoke: (token: string, done?: () => void) => void
        }
      }
    }
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const DRIVE_FILE_NAME = 'fairway-backup.json'
const FILE_ID_KEY = 'fairway:driveFileId'
const CONNECTED_KEY = 'fairway:driveConnected'
const TOKEN_CACHE_KEY = 'fairway:driveTokenCache'
const SILENT_AUTH_TIMEOUT_MS = 4000

interface CachedToken {
  value: string
  expiresAt: number
}

let gisLoadPromise: Promise<void> | null = null
let tokenClient: TokenClient | null = null
// GIS's token client always pops a (brief, visible) window when asked for a
// token — there's no truly invisible iframe renewal without a backend — so
// reusing an unexpired token across page loads is what keeps that from
// happening on every refresh. Persisted to localStorage rather than just
// held in memory, since a plain JS variable is wiped on every reload.
let cachedToken: CachedToken | null = loadCachedToken()

function loadCachedToken(): CachedToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedToken
    return parsed.expiresAt > Date.now() ? parsed : null
  } catch {
    return null
  }
}

function saveCachedToken(token: CachedToken | null): void {
  cachedToken = token
  if (token) localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(token))
  else localStorage.removeItem(TOKEN_CACHE_KEY)
}

export function isDriveConfigured(): boolean {
  return !!CLIENT_ID
}

export function isDriveConnected(): boolean {
  return isDriveConfigured() && localStorage.getItem(CONNECTED_KEY) === 'true'
}

function loadGis(): Promise<void> {
  if (gisLoadPromise) return gisLoadPromise
  gisLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Google Identity Services.'))
    document.head.appendChild(script)
  })
  return gisLoadPromise
}

async function ensureTokenClient(): Promise<TokenClient> {
  if (!CLIENT_ID) {
    throw new Error('Google Drive is not set up for this build (missing VITE_GOOGLE_CLIENT_ID).')
  }
  await loadGis()
  if (!tokenClient) {
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: () => {}, // replaced per-request in requestToken()
    })
  }
  return tokenClient
}

function requestToken(interactive: boolean): Promise<string> {
  return ensureTokenClient().then(
    (client) =>
      new Promise<string>((resolve, reject) => {
        const timeoutId = interactive
          ? null
          : setTimeout(() => reject(new Error('Silent Google sign-in timed out.')), SILENT_AUTH_TIMEOUT_MS)

        client.callback = (resp) => {
          if (timeoutId) clearTimeout(timeoutId)
          if (resp.error || !resp.access_token) {
            reject(new Error(resp.error ?? 'Google sign-in did not return an access token.'))
            return
          }
          saveCachedToken({
            value: resp.access_token,
            expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000 - 60_000,
          })
          resolve(resp.access_token)
        }
        client.requestAccessToken({ prompt: interactive ? 'consent' : '' })
      }),
  )
}

async function getAccessToken(interactive: boolean): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value
  return requestToken(interactive)
}

export async function connectDrive(): Promise<void> {
  await requestToken(true)
  localStorage.setItem(CONNECTED_KEY, 'true')
}

export function disconnectDrive(): void {
  const token = cachedToken?.value
  saveCachedToken(null)
  localStorage.removeItem(CONNECTED_KEY)
  localStorage.removeItem(FILE_ID_KEY)
  if (token) window.google?.accounts.oauth2.revoke(token, () => {})
}

async function findExistingFileId(token: string): Promise<string | null> {
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', `name='${DRIVE_FILE_NAME}' and trashed=false`)
  url.searchParams.set('spaces', 'drive')
  url.searchParams.set('fields', 'files(id,name)')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Drive search failed: ${res.status}`)
  const data = (await res.json()) as { files: { id: string; name: string }[] }
  return data.files[0]?.id ?? null
}

async function createDriveFile(token: string, content: string): Promise<string> {
  const boundary = 'fairway-backup-boundary'
  const metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json' }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!res.ok) throw new Error(`Drive create failed: ${res.status}`)
  const data = (await res.json()) as { id: string }
  return data.id
}

async function updateDriveFile(token: string, fileId: string, content: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: content,
  })
  if (!res.ok) throw new Error(`Drive update failed: ${res.status}`)
}

async function getDriveFileContent(token: string, fileId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Drive fetch failed: ${res.status}`)
  return res.text()
}

export async function pushBackupToDrive(): Promise<void> {
  const token = await getAccessToken(true)
  const content = JSON.stringify(await buildBackupPayload())

  let fileId = localStorage.getItem(FILE_ID_KEY) ?? (await findExistingFileId(token))
  if (fileId) {
    await updateDriveFile(token, fileId, content)
  } else {
    fileId = await createDriveFile(token, content)
  }
  localStorage.setItem(FILE_ID_KEY, fileId)
}

/** Returns true if a remote backup was found and merged in. */
export async function pullBackupFromDrive(interactive: boolean): Promise<boolean> {
  if (!isDriveConnected()) return false
  const token = await getAccessToken(interactive)

  let fileId = localStorage.getItem(FILE_ID_KEY)
  if (!fileId) {
    fileId = await findExistingFileId(token)
    if (!fileId) return false
    localStorage.setItem(FILE_ID_KEY, fileId)
  }

  const text = await getDriveFileContent(token, fileId)
  const payload = JSON.parse(text) as BackupFile
  await mergeBackupPayload(payload)
  return true
}
