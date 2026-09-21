import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
}

export function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div
      className="sheet-backdrop fixed inset-0 flex items-end sm:items-center justify-center z-50"
      style={{ background: 'rgba(10, 60, 40, 0.35)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="glass sheet-panel rounded-t-3xl sm:rounded-3xl p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ color: 'var(--ink)' }} className="font-bold text-lg mb-3">
          {title}
        </div>
        {children}
      </div>
    </div>
  )
}
