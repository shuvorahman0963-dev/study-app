import { db, getSetting } from '../db'
import { daysLeft, isDue, isNew, newCardsDoneToday, startOfToday } from './scheduler'
import { currentSleepState, WIND_DOWN_MIN, type SleepState } from './sleep'

export interface PlanItem {
  id: string
  kind: 'retest' | 'review' | 'weak' | 'new' | 'practice'
  title: string
  sub: string
  minutes: number
  link: string
  score: number
  subjectId?: number
}

export interface Plan {
  today: PlanItem[]
  later: PlanItem[]
  budget: number // minutes available before wind-down
  sleep: SleepState
}

// Rough time estimates (minutes).
const MIN_PER_DUE = 0.75
const MIN_PER_NEW = 1.5
const MIN_EXPLAIN = 10
const MIN_WEAK_QUIZ = 10
const MIN_PRACTICE = 25

/** Closer exam → bigger number. Subjects without a date get a small constant. */
function urgency(examDate: string) {
  const left = daysLeft(examDate)
  if (left === null) return 0.5
  if (left < 0) return -1 // exam over
  return 10 / (left + 1)
}

/**
 * Today's plan: retest → due reviews → weak topics → new topics.
 * New topics are ranked by past-paper frequency, marks, exam closeness and weakness,
 * and the list is cut where it would run past bedtime.
 */
export async function buildPlan(): Promise<Plan> {
  const [subjects, topics, cards, weak, sleep] = await Promise.all([
    db.subjects.toArray(), db.topics.toArray(), db.cards.toArray(),
    db.weakTopics.where('status').notEqual('cleared').toArray(), currentSleepState(),
  ])
  const subj = new Map(subjects.map((s) => [s.id, s]))
  const topicMap = new Map(topics.map((t) => [t.id, t]))
  const now = Date.now()
  const items: PlanItem[] = []

  const retest = weak.filter((w) => w.status === 'retest' && (w.retestAt ?? 0) <= now)
  if (retest.length) {
    items.push({
      id: 'retest', kind: 'retest', title: `Retest ${retest.length} weak topic${retest.length > 1 ? 's' : ''}`,
      sub: retest.map((w) => topicMap.get(w.topicId)?.title).join(', '), minutes: MIN_WEAK_QUIZ, link: '/quiz?source=retest', score: 1000,
    })
  }

  for (const s of subjects) {
    const u = urgency(s.examDate)
    if (u < 0) continue
    const due = cards.filter((c) => c.subjectId === s.id && isDue(c, now)).length
    if (due) {
      items.push({
        id: `review-${s.id}`, kind: 'review', title: `Review ${due} due card${due > 1 ? 's' : ''}`, sub: s.name,
        minutes: Math.max(2, Math.ceil(due * MIN_PER_DUE)), link: `/review?subject=${s.id}`, score: 500 + u * 10, subjectId: s.id,
      })
    }
  }

  for (const w of weak.filter((x) => x.status === 'explain')) {
    const s = subj.get(w.subjectId)
    if (s && urgency(s.examDate) < 0) continue
    items.push({
      id: `weak-${w.id}`, kind: 'weak', title: `Explain: ${topicMap.get(w.topicId)?.title ?? 'weak topic'}`,
      sub: `${s?.name ?? ''} · ${w.missedCardIds.length} missed`, minutes: MIN_EXPLAIN, link: '/weak', score: 300 + w.missedCardIds.length * 5, subjectId: w.subjectId,
    })
  }
  const readyWeak = weak.filter((x) => x.status === 'quiz')
  if (readyWeak.length) {
    items.push({
      id: 'weak-quiz', kind: 'weak', title: `Weak-topic quiz (${readyWeak.length} topics)`, sub: '10 questions',
      minutes: MIN_WEAK_QUIZ, link: '/quiz?source=weak', score: 290,
    })
  }

  // Math subjects: one interleaved practice block a day until done today.
  const problems = await db.problems.toArray()
  const practicedToday = new Set((await db.problemAttempts.where('at').aboveOrEqual(startOfToday()).toArray()).map((a) => a.subjectId))
  for (const s of subjects) {
    const u = urgency(s.examDate)
    if (u < 0 || practicedToday.has(s.id) || !problems.some((p) => p.subjectId === s.id)) continue
    items.push({
      id: `practice-${s.id}`, kind: 'practice', title: 'Mixed problem practice (5)', sub: s.name,
      minutes: MIN_PRACTICE, link: `/practice?subject=${s.id}`, score: 250 + u * 10, subjectId: s.id,
    })
  }

  // New topics, limited by today's remaining new-card allowance.
  const missedByTopic = new Map(weak.map((w) => [w.topicId, w.missedCardIds.length]))
  let newLeft = Math.max(0, (await getSetting('newPerDay', 30)) - (await newCardsDoneToday()))
  const fresh = topics
    .map((t) => {
      const s = subj.get(t.subjectId)
      const u = s ? urgency(s.examDate) : -1
      const n = cards.filter((c) => c.topicId === t.id && isNew(c)).length
      const score = t.pastPaperFrequency * 3 + t.marks / 2 + u * 5 + (missedByTopic.get(t.id) ?? 0) * 2
      return { t, s, u, n, score }
    })
    .filter((x) => x.n > 0 && x.u >= 0)
    .sort((a, b) => b.score - a.score)
  for (const x of fresh) {
    if (newLeft <= 0) break
    newLeft -= x.n
    items.push({
      id: `new-${x.t.id}`, kind: 'new', title: x.t.title,
      sub: `${x.s?.name ?? ''} · ${x.n} new cards${x.t.pastPaperFrequency ? ` · 🔥${x.t.pastPaperFrequency}` : ''}`,
      minutes: Math.ceil(x.n * MIN_PER_NEW), link: `/review?topic=${x.t.id}`, score: 100 + x.score, subjectId: x.t.subjectId,
    })
  }

  items.sort((a, b) => b.score - a.score)
  const budget = sleep.asleep ? 0 : Math.max(0, sleep.minutesLeft - WIND_DOWN_MIN)
  const today: PlanItem[] = []
  const later: PlanItem[] = []
  let used = 0
  for (const it of items) {
    if (used + it.minutes <= budget) {
      today.push(it)
      used += it.minutes
    } else later.push(it)
  }
  return { today, later, budget, sleep }
}
