import { db, getSetting, type StudyCard, type Topic } from '../db'
import { isDue, isNew, newCardsDoneToday } from './scheduler'

export interface SessionFilter {
  subjectId?: number
  topicId?: number
}

/** A review session survives reloads so it can only end when the queue is empty. */
export interface Session {
  filter: SessionFilter
  queue: number[] // card ids still to answer correctly
  total: number
  correctFirstTry: number
  misses: number
  missedIds: number[]
  startedAt: number
}

const KEY = 'study-session'

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: the session just won't survive a reload */
  }
}

/** Higher past-paper frequency first, then chapter/topic order. */
export function priority(topics: Map<number, Topic>) {
  return (a: StudyCard, b: StudyCard) => {
    const ta = topics.get(a.topicId)
    const tb = topics.get(b.topicId)
    return (tb?.pastPaperFrequency ?? 0) - (ta?.pastPaperFrequency ?? 0) || (ta?.order ?? 0) - (tb?.order ?? 0) || a.id - b.id
  }
}

export async function cardsFor(filter: SessionFilter): Promise<StudyCard[]> {
  if (filter.topicId) return db.cards.where({ topicId: filter.topicId }).toArray()
  if (filter.subjectId) return db.cards.where({ subjectId: filter.subjectId }).toArray()
  return db.cards.toArray()
}

export async function buildSession(filter: SessionFilter): Promise<Session> {
  const cards = await cardsFor(filter)
  const topics = new Map((await db.topics.toArray()).map((t) => [t.id, t]))
  const now = Date.now()
  const order = priority(topics)

  const due = cards.filter((c) => isDue(c, now)).sort(order)
  const fresh = cards.filter(isNew).sort(order)

  // Studying a single topic introduces all its new cards; otherwise respect the daily new-card limit.
  let newCount = fresh.length
  if (!filter.topicId) {
    const limit = await getSetting('newPerDay', 30)
    newCount = Math.max(0, limit - (await newCardsDoneToday()))
  }
  const queue = [...due, ...fresh.slice(0, newCount)].map((c) => c.id)
  return { filter, queue, total: queue.length, correctFirstTry: 0, misses: 0, missedIds: [], startedAt: now }
}

/** Due + available-new counts per subject for dashboards. */
export async function countsBySubject() {
  const cards = await db.cards.toArray()
  const limit = await getSetting('newPerDay', 30)
  const newLeft = Math.max(0, limit - (await newCardsDoneToday()))
  const now = Date.now()
  const map = new Map<number, { due: number; fresh: number; total: number }>()
  for (const c of cards) {
    const m = map.get(c.subjectId) ?? { due: 0, fresh: 0, total: 0 }
    m.total++
    if (isDue(c, now)) m.due++
    else if (isNew(c)) m.fresh++
    map.set(c.subjectId, m)
  }
  return { map, newLeft }
}
