import { useState } from 'react'
import type { HoleScore } from '../db/schema'
import { Modal } from './Modal'
import { BigButton } from './BigButton'
import { TEE_SHOT_LIE_LABELS } from '../lib/lies'

interface EditHoleScoreModalProps {
  score: HoleScore
  onClose: () => void
  onSave: (updated: HoleScore) => void
}

const ink = { color: 'var(--ink)' }
const inkMuted = { color: 'var(--ink-muted)' }
const pillOn = {
  background: 'linear-gradient(180deg, #8CF0A8 0%, #34C864 48%, #1E9E4A 100%)',
  boxShadow: '0 4px 10px rgba(20,120,60,0.35)',
  color: '#ffffff',
}
const pillOff = { background: 'rgba(255,255,255,0.5)', color: 'var(--ink-muted)' }

function Stepper({
  label,
  value,
  min,
  onChange,
}: {
  label: string
  value: number
  min: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium" style={ink}>
        {label}
      </span>
      <div className="flex items-center gap-4">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-11 h-11 rounded-full glass-solid text-xl font-bold disabled:opacity-30"
          style={ink}
        >
          −
        </button>
        <span className="text-2xl font-bold w-8 text-center" style={ink}>
          {value}
        </span>
        <button
          onClick={() => onChange(value + 1)}
          className="w-11 h-11 rounded-full glass-solid text-xl font-bold"
          style={ink}
        >
          +
        </button>
      </div>
    </div>
  )
}

function TriToggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | null
  onChange: (next: boolean | null) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium" style={ink}>
        {label}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(value === true ? null : true)}
          className="min-h-9 px-4 rounded-full text-sm font-semibold"
          style={value === true ? pillOn : pillOff}
        >
          Yes
        </button>
        <button
          onClick={() => onChange(value === false ? null : false)}
          className="min-h-9 px-4 rounded-full text-sm font-semibold"
          style={value === false ? pillOn : pillOff}
        >
          No
        </button>
      </div>
    </div>
  )
}

/** Lets a user correct a hole's recorded score after the fact — strokes,
 * putts, tee shot lie, and greens in regulation — for whichever hole they
 * tap on the scorecard. */
export function EditHoleScoreModal({ score, onClose, onSave }: EditHoleScoreModalProps) {
  const [strokes, setStrokes] = useState(score.strokes)
  const [putts, setPutts] = useState(score.putts)
  const [teeShotLie, setTeeShotLie] = useState(score.teeShotLie)
  const [greenInRegulation, setGreenInRegulation] = useState(score.greenInRegulation)

  function changePutts(next: number) {
    setPutts(next)
    if (next > strokes) setStrokes(next)
  }

  function save() {
    onSave({ ...score, strokes, putts, teeShotLie, greenInRegulation })
  }

  return (
    <Modal title={`Edit hole ${score.holeNumber} (par ${score.par})`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Stepper label="Strokes" value={strokes} min={putts} onChange={setStrokes} />
        <Stepper label="Putts" value={putts} min={0} onChange={changePutts} />
        {score.par >= 4 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium" style={ink}>
              Tee shot
            </span>
            <div className="flex gap-2">
              {(['fairway', 'rough', 'sand'] as const).map((lie) => (
                <button
                  key={lie}
                  onClick={() => setTeeShotLie(teeShotLie === lie ? null : lie)}
                  className="flex-1 min-h-9 px-2 rounded-full text-sm font-semibold"
                  style={teeShotLie === lie ? pillOn : pillOff}
                >
                  {TEE_SHOT_LIE_LABELS[lie]}
                </button>
              ))}
            </div>
          </div>
        )}
        <TriToggle label="Green in regulation" value={greenInRegulation} onChange={setGreenInRegulation} />
        <p className="text-xs -mt-1" style={inkMuted}>
          This only changes what's on the scorecard — it won't move or remove any GPS-tracked
          shots from this hole.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <BigButton onClick={save}>Save</BigButton>
          <BigButton variant="secondary" onClick={onClose}>
            Cancel
          </BigButton>
        </div>
      </div>
    </Modal>
  )
}
