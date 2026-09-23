// Baked in at build time (see vite.config.ts) so Settings can show exactly
// which build is running — the commit + timestamp change automatically on
// every deploy, unlike a version number that has to be remembered.
export const APP_VERSION = __APP_VERSION__
export const BUILD_COMMIT = __BUILD_COMMIT__
export const BUILD_TIME = __BUILD_TIME__

export function buildLabel(): string {
  const built = new Date(BUILD_TIME)
  const when = Number.isNaN(built.getTime())
    ? 'unknown time'
    : `${built.toLocaleDateString()} ${built.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  return `v${APP_VERSION} · ${BUILD_COMMIT} · built ${when}`
}
