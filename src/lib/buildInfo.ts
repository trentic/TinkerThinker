// Baked in at build time (see vite.config.ts) so Settings can show exactly
// which build is running. Leads with the commit + timestamp, not the
// package.json version — that number has never been bumped and never
// changes between deploys, so leading with it made every build look
// identical even when the commit right after it had actually changed.
export const APP_VERSION = __APP_VERSION__
export const BUILD_COMMIT = __BUILD_COMMIT__
export const BUILD_TIME = __BUILD_TIME__

export function buildLabel(): string {
  const built = new Date(BUILD_TIME)
  const when = Number.isNaN(built.getTime())
    ? 'unknown time'
    : `${built.toLocaleDateString()} ${built.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  return `Build ${BUILD_COMMIT} · ${when}`
}
