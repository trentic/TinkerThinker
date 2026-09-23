import { useState } from 'react'
import { Modal } from './Modal'

interface InfoTipProps {
  term: string
  explanation: string
}

/** Small tappable "?" that explains a golf term in plain language — for
 * jargon (GIR, scrambling, to-par notation) that a first-time player
 * wouldn't otherwise know. */
export function InfoTip({ term, explanation }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ml-1 align-middle"
        style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--ink-muted)' }}
        aria-label={`What does "${term}" mean?`}
      >
        ?
      </button>
      {open && (
        <Modal title={term} onClose={() => setOpen(false)}>
          <p className="text-sm" style={{ color: 'var(--ink-secondary)' }}>
            {explanation}
          </p>
        </Modal>
      )}
    </>
  )
}
