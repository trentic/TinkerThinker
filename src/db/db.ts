import Dexie, { type EntityTable } from 'dexie'
import type { Course, Tee, Hole, Round, HoleScore, Shot, BagClub } from './schema'

class FairwayDB extends Dexie {
  courses!: EntityTable<Course, 'id'>
  tees!: EntityTable<Tee, 'id'>
  holes!: EntityTable<Hole, 'id'>
  rounds!: EntityTable<Round, 'id'>
  holeScores!: EntityTable<HoleScore, 'id'>
  shots!: EntityTable<Shot, 'id'>
  bagClubs!: EntityTable<BagClub, 'club'>

  constructor() {
    super('fairway')
    this.version(1).stores({
      courses: 'id, name',
      tees: 'id, courseId',
      holes: 'id, courseId, [courseId+number]',
      rounds: 'id, courseId, date',
      holeScores: 'id, roundId, [roundId+holeNumber]',
      shots: 'id, roundId, [roundId+holeNumber], club',
    })
    this.version(2).stores({
      courses: 'id, name',
      tees: 'id, courseId',
      holes: 'id, courseId, [courseId+number]',
      rounds: 'id, courseId, date',
      holeScores: 'id, roundId, [roundId+holeNumber]',
      shots: 'id, roundId, [roundId+holeNumber], club',
      bagClubs: 'club',
    })
  }
}

export const db = new FairwayDB()

export function newId(): string {
  return crypto.randomUUID()
}
