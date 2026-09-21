import type { ReactElement } from 'react'
import { NavLink } from 'react-router-dom'

const ITEMS: { to: string; label: string; icon: (active: boolean) => ReactElement }[] = [
  {
    to: '/',
    label: 'Home',
    icon: (active) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? '#ffffff' : '#2d8a5c'} strokeWidth="2.2">
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
      </svg>
    ),
  },
  {
    to: '/rounds',
    label: 'Rounds',
    icon: (active) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? '#ffffff' : '#2d8a5c'} strokeWidth="2.2">
        <rect x="4" y="5" width="16" height="3" rx="1" />
        <rect x="4" y="10.5" width="16" height="3" rx="1" />
        <rect x="4" y="16" width="16" height="3" rx="1" />
      </svg>
    ),
  },
  {
    to: '/stats',
    label: 'Stats',
    icon: (active) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? '#ffffff' : '#2d8a5c'} strokeWidth="2.2">
        <rect x="4" y="12" width="3.5" height="8" rx="1" />
        <rect x="10.2" y="7" width="3.5" height="13" rx="1" />
        <rect x="16.5" y="3" width="3.5" height="17" rx="1" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (active) => (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={active ? '#ffffff' : '#2d8a5c'} strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
]

export function BottomNav() {
  return (
    <nav
      className="glass fixed bottom-3 left-3 right-3 max-w-md mx-auto rounded-[28px] flex justify-around px-2 py-2"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
    >
      {ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} className="flex flex-col items-center gap-1 py-1 px-3">
          {({ isActive }) => (
            <>
              <span
                className="flex items-center justify-center rounded-full transition-transform duration-150"
                style={{
                  width: 38,
                  height: 38,
                  background: isActive
                    ? 'radial-gradient(circle at 32% 26%, #d8ffe8, #33c47c 55%, #16824f 100%)'
                    : 'linear-gradient(180deg, #f3fdf6, #d4f3df)',
                  boxShadow: isActive
                    ? '0 4px 8px rgba(15,110,70,0.35), inset 0 -3px 6px rgba(0,60,35,0.25)'
                    : '0 3px 6px rgba(15,110,70,0.12)',
                }}
              >
                {item.icon(isActive)}
              </span>
              <span
                className="text-[10px] font-semibold"
                style={{ color: isActive ? 'var(--ink)' : 'var(--ink-secondary)' }}
              >
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
