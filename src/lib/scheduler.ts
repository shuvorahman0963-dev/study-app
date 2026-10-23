import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card as FsrsCard, type Grade } from 'ts-fsrs'
import { db, type StudyCard, type Subject } from '../db'

const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }))

const DAY = 24 * 60 * 60 * 1000

export { Rating, State }
export const newFsrsCard = (): FsrsCard => createEmptyCard(new Date())

/** Exam date as the start of that day in local time, or null. */
export function examTime(examDate: string): number | null {
  if (!examDate) return null
  const [y, m, d] = examDate.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).getTime()
}

export function daysLeft(examDate: string, now = Date.now()): number | null {
  const t = examTime(examDate)
  if (t === null) return null
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return Math.round((t - today.getTime()) / DAY)
}

/**
 * Exam mode: keeps every review before the exam.
 * - Interval is capped to half the remaining days, so each card is seen at least twice more.
 * - In the final 3 days every card comes back daily.
 */
function applyExamMode(card: FsrsCard, examDate: string, now: Date): FsrsCard {
  const left = daysLeft(examDate, now.getTime())
  if (left === null || left <= 0) return card
  const capDays = left <= 3 ? 1 : Math.max(1, Math.floor(left / 2))
  const latest = now.getTime() + capDays * DAY
  if (card.due.getTime() <= latest) return card
  return { ...card, due: new Date(latest), scheduled_days: capDays }
}

export function rateCard(card: StudyCard, grade: Grade, subject: Subject | undefined, now = new Date()): FsrsCard {
  const next = scheduler.next(card.fsrs, now, grade).card
  return subject ? applyExamMode(next, subject.examDate, now) : next
}

/** Short label like "10m", "3d" for the button preview. */
export function previewIntervals(card: StudyCard, subject: Subject | undefined, now = new Date()) {
  const out: Record<number, string> = {}
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
    const due = rateCard(card, g, subject, now).due.getTime()
    out[g] = formatSpan(due - now.getTime())
  }
  return out
}

export function formatSpan(ms: number) {
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `${min}m`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d`
  return `${Math.round(d / 30)}mo`
}

/** Probability (0–1) of recalling the card at `at`; 0 for cards never studied. */
export function retrievability(c: StudyCard, at: Date = new Date()): number {
  if (isNew(c)) return 0
  return scheduler.get_retrievability(c.fsrs, at, false)
}

export const isNew =(c: StudyCard) => c.fsrs.state === State.New
export const isDue = (c: StudyCard, now = Date.now()) => !isNew(c) && new Date(c.fsrs.due).getTime() <= now

export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** How many brand-new cards were already started today (across all subjects). */
export async function newCardsDoneToday() {
  const logs = await db.reviewLogs.where('at').aboveOrEqual(startOfToday()).toArray()
  return new Set(logs.filter((l) => l.wasNew).map((l) => l.cardId)).size
}
