import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-green-600 active:bg-green-700 text-white',
  secondary: 'bg-neutral-800 active:bg-neutral-700 text-white border border-neutral-700',
  danger: 'bg-red-700 active:bg-red-800 text-white',
  ghost: 'bg-transparent active:bg-neutral-800 text-neutral-200 border border-neutral-700',
}

interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

// Golf-course UI: sunlight, gloves, one-handed use. Buttons stay large,
// high-contrast, and forgiving of imprecise taps.
export function BigButton({ variant = 'primary', className = '', children, ...rest }: BigButtonProps) {
  return (
    <button
      className={`min-h-16 px-6 rounded-2xl text-lg font-semibold shadow-lg transition-colors disabled:opacity-40 disabled:pointer-events-none ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
