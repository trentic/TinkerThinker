import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

type Variant = 'primary' | 'blue' | 'secondary' | 'danger' | 'ghost'

// Frutiger Aero glossy pills: a gradient fill, a soft drop shadow, and a
// gloss-highlight overlay (rendered separately below) streaked across the
// top. Green is the app's home color; blue is reserved for the round
// screen's single most-tapped action so it reads as distinct.
const VARIANT_STYLE: Record<Variant, CSSProperties & { showGloss?: boolean }> = {
  primary: {
    background: 'linear-gradient(180deg, #8CF0A8 0%, #34C864 48%, #1E9E4A 100%)',
    boxShadow: '0 8px 16px rgba(20,120,60,0.35)',
    border: '1px solid rgba(255,255,255,0.6)',
    color: '#ffffff',
    textShadow: '0 1px 2px rgba(0,60,20,0.35)',
    showGloss: true,
  },
  blue: {
    background: 'linear-gradient(180deg, #9FD8FF 0%, #3B9FE8 48%, #1B6FC2 100%)',
    boxShadow: '0 8px 16px rgba(15,90,150,0.35)',
    border: '1px solid rgba(255,255,255,0.6)',
    color: '#ffffff',
    textShadow: '0 1px 2px rgba(0,30,70,0.35)',
    showGloss: true,
  },
  danger: {
    background: 'linear-gradient(180deg, #FFB199 0%, #FF6B4A 48%, #E8431F 100%)',
    boxShadow: '0 8px 16px rgba(150,40,10,0.3)',
    border: '1px solid rgba(255,255,255,0.6)',
    color: '#ffffff',
    textShadow: '0 1px 2px rgba(80,10,0,0.35)',
    showGloss: true,
  },
  secondary: {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0.5))',
    boxShadow: '0 6px 14px rgba(10,110,70,0.15)',
    border: '1px solid rgba(255,255,255,0.85)',
    color: 'var(--ink)',
  },
  ghost: {
    background: 'rgba(255,255,255,0.25)',
    border: '1px solid rgba(255,255,255,0.5)',
    color: 'var(--ink-secondary)',
  },
}

interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

// Golf-course UI: sunlight, gloves, one-handed use. Buttons stay large,
// high-contrast, and forgiving of imprecise taps.
export function BigButton({ variant = 'primary', className = '', style, children, ...rest }: BigButtonProps) {
  const { showGloss, ...variantStyle } = VARIANT_STYLE[variant]
  return (
    <button
      className={`relative overflow-hidden min-h-16 px-7 rounded-full text-lg font-bold transition-transform duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none ${className}`}
      style={{ ...variantStyle, ...style }}
      {...rest}
    >
      {showGloss && <span className="gloss-highlight rounded-t-full" />}
      <span className="relative">{children}</span>
    </button>
  )
}
