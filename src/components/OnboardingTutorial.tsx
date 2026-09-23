import { useState } from 'react'
import { Modal } from './Modal'
import { BigButton } from './BigButton'

interface Step {
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    title: 'Par is the target',
    body:
      "Every hole has a par — the number of strokes a good golfer expects to take. \"Par 4\" means 4 is a good score there. Par is set by the course, not by you.",
  },
  {
    title: 'Tap after every stroke',
    body:
      'Each time you hit the ball, tap "Mark my ball". That\'s it — that\'s how the app counts your strokes for the hole. No math, no writing anything down.',
  },
  {
    title: 'Putting counts too',
    body:
      'Once your ball is on the green, tap "On the green", then tap "+1 Putt" for each putt. Putts are strokes too — they add to your total.',
  },
  {
    title: 'Reading your score',
    body:
      'After a hole, you\'ll see something like "5 (+1)". The first number is your strokes. The part in parentheses is strokes vs. par: "+1" means one over par (a bogey), "-1" means one under par (a birdie), and "E" means exactly even with par.',
  },
]

interface OnboardingTutorialProps {
  onDone: () => void
}

/** First-time explainer for how scoring works at all — shown once
 * automatically, and re-openable any time from Settings. */
export function OnboardingTutorial({ onDone }: OnboardingTutorialProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]
  const isLast = stepIndex === STEPS.length - 1

  return (
    <Modal title={step.title} onClose={onDone}>
      <div className="flex flex-col gap-4">
        <p className="text-sm" style={{ color: 'var(--ink-secondary)' }}>
          {step.body}
        </p>
        <div className="flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full"
              style={{ background: i === stepIndex ? 'var(--color-green)' : 'rgba(255,255,255,0.6)' }}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {stepIndex > 0 ? (
            <BigButton variant="secondary" onClick={() => setStepIndex((i) => i - 1)}>
              Back
            </BigButton>
          ) : (
            <BigButton variant="ghost" onClick={onDone}>
              Skip
            </BigButton>
          )}
          <BigButton onClick={() => (isLast ? onDone() : setStepIndex((i) => i + 1))}>
            {isLast ? 'Got it' : 'Next'}
          </BigButton>
        </div>
      </div>
    </Modal>
  )
}
