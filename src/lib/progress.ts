import { db, type Subject } from '../db'
import { examTime, isNew, retrievability, startOfToday } from './scheduler'

const DAY = 24 * 60 * 60 * 1000
export const TREND_DAYS = 14
/** A topic counts as covered when this share of its cards has been studied. */
const COVERED_SHARE = 0.8

export interface SubjectProgress {
  subject: Subject
  topicsTotal: number
  topicsCovered: number
  coverage: number // 0–1
  memory: number // weighted recall probability on exam day, 0–1
  accuracy7: number | null // last 7 days, 0–1
  trend: { day: number; correct: number; total: number }[]
  weakTopics: string[]
  focusMin7: number
  readiness: number // 0–100
}

/**
 * Readiness = 60% memory (FSRS recall chance on exam day, weighted by past-paper frequency)
 *           + 25% coverage + 15% recent accuracy.
 */
export async function subjectProgress(): Promise<SubjectProgress[]> {
  const [subjects, topics, cards, logs, quiz, weak, focus, probs] = await Promise.all([
    db.subjects.toArray(), db.topics.toArray(), db.cards.toArray(),
    db.reviewLogs.where('at').aboveOrEqual(startOfToday() - (TREND_DAYS - 1) * DAY).toArray(),
    db.quizResults.where('at').aboveOrEqual(startOfToday() - (TREND_DAYS - 1) * DAY).toArray(),
    db.weakTopics.where('status').notEqual('cleared').toArray(),
    db.focusSessions.where('at').aboveOrEqual(startOfToday() - 6 * DAY).toArray(),
    db.problemAttempts.where('at').aboveOrEqual(startOfToday() - (TREND_DAYS - 1) * DAY).toArray(),
  ])
  const today = startOfToday()

  return subjects.map((subject) => {
    const sTopics = topics.filter((t) => t.subjectId === subject.id)
    const sCards = cards.filter((c) => c.subjectId === subject.id)
    const withCards = sTopics.filter((t) => sCards.some((c) => c.topicId === t.id))
    const covered = withCards.filter((t) => {
      const tc = sCards.filter((c) => c.topicId === t.id)
      return tc.filter((c) => !isNew(c)).length / tc.length >= COVERED_SHARE
    })

    const exam = examTime(subject.examDate)
    const at = new Date(exam && exam > Date.now() ? exam : Date.now())
    const freq = new Map(sTopics.map((t) => [t.id, t.pastPaperFrequency]))
    let wSum = 0
    let rSum = 0
    for (const c of sCards) {
      const w = 1 + (freq.get(c.topicId) ?? 0)
      wSum += w
      rSum += w * retrievability(c, at)
    }
    const memory = wSum ? rSum / wSum : 0

    const answers = [
      ...logs.filter((l) => l.subjectId === subject.id).map((l) => ({ at: l.at, correct: l.correct })),
      ...quiz.filter((q) => q.subjectId === subject.id).map((q) => ({ at: q.at, correct: q.correct })),
      ...probs.filter((p) => p.subjectId === subject.id).map((p) => ({ at: p.at, correct: p.result === 'solved' })),
    ]
    const trend = Array.from({ length: TREND_DAYS }, (_, i) => {
      const day = today - (TREND_DAYS - 1 - i) * DAY
      const inDay = answers.filter((a) => a.at >= day && a.at < day + DAY)
      return { day, correct: inDay.filter((a) => a.correct).length, total: inDay.length }
    })
    const last7 = trend.slice(-7)
    const t7 = last7.reduce((a, d) => a + d.total, 0)
    const accuracy7 = t7 ? last7.reduce((a, d) => a + d.correct, 0) / t7 : null

    const coverage = withCards.length ? covered.length / withCards.length : 0
    const readiness = Math.round(100 * (0.6 * memory + 0.25 * coverage + 0.15 * (accuracy7 ?? 0)))
    const topicTitle = new Map(sTopics.map((t) => [t.id, t.title]))

    return {
      subject,
      topicsTotal: withCards.length,
      topicsCovered: covered.length,
      coverage,
      memory,
      accuracy7,
      trend,
      weakTopics: weak.filter((w) => w.subjectId === subject.id).map((w) => topicTitle.get(w.topicId) ?? '?'),
      focusMin7: focus.filter((f) => f.subjectId === subject.id).reduce((a, f) => a + f.minutes, 0),
      readiness,
    }
  })
}
