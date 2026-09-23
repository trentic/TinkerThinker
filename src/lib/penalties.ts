import type { PenaltyType } from '../db/schema'

export const PENALTY_LABELS: Record<PenaltyType, string> = {
  water: 'Water hazard',
  oob: 'Out of bounds',
  lost: 'Lost ball',
  unplayable: 'Unplayable lie',
}
