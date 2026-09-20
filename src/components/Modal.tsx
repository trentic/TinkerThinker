import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
}

export function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-neutral-900 rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white font-semibold text-lg mb-3">{title}</div>
        {children}
      </div>
    </div>
  )
}
