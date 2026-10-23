import { db, type QuizSource, type StudyCard } from '../db'
import { startOfToday } from './scheduler'

const DAY = 24 * 60 * 60 * 1000

/** Records a missed card under its topic's active weak entry (creates one if needed). */
export function markWeak(card: Pick<StudyCard, 'id' | 'topicId' | 'subjectId'>) {
  return markWeakTopic(card.subjectId, card.topicId, card.id)
}

/** Flags a topic as weak; cardId is optional (a failed problem or past-paper question has none). */
export async function markWeakTopic(subjectId: number, topicId: number, cardId?: number) {
  const now = Date.now()
  const active = (await db.weakTopics.where({ topicId }).toArray()).find((w) => w.status !== 'cleared')
  if (active) {
    if (cardId !== undefined && !active.missedCardIds.includes(cardId)) {
      await db.weakTopics.update(active.id, { missedCardIds: [...active.missedCardIds, cardId], updatedAt: now })
    }
    return
  }
  await db.weakTopics.add({
    subjectId, topicId, status: 'explain', missedCardIds: cardId === undefined ? [] : [cardId],
    explanation: '', retestAt: null, createdAt: now, updatedAt: now,
  } as never)
}

export const tomorrow = () => startOfToday() + DAY

/** Retest pass mark for clearing a weak topic. */
export const PASS = 0.8

/**
 * Called after a weak/retest quiz.
 * weak quiz → every topic moves to retest tomorrow.
 * retest   → ≥80% clears the topic, otherwise it goes back to "explain" with the cards missed this time.
 */
export async function finishWeakQuiz(source: QuizSource, results: { cardId: number; topicId: number; correct: boolean }[]) {
  const now = Date.now()
  const byTopic = new Map<number, { right: number; total: number; missed: number[] }>()
  for (const r of results) {
    const t = byTopic.get(r.topicId) ?? { right: 0, total: 0, missed: [] }
    t.total++
    if (r.correct) t.right++
    else t.missed.push(r.cardId)
    byTopic.set(r.topicId, t)
  }
  for (const [topicId, t] of byTopic) {
    const w = (await db.weakTopics.where({ topicId }).toArray()).find((x) => x.status !== 'cleared')
    if (!w) continue
    if (source === 'weak') {
      await db.weakTopics.update(w.id, { status: 'retest', retestAt: tomorrow(), updatedAt: now })
    } else if (t.right / t.total >= PASS) {
      await db.weakTopics.update(w.id, { status: 'cleared', retestAt: null, updatedAt: now })
    } else {
      await db.weakTopics.update(w.id, { status: 'explain', missedCardIds: t.missed, explanation: '', retestAt: null, updatedAt: now })
    }
  }

  // Topics that had no flashcards to ask (e.g. flagged from a math problem) still move forward.
  const pending = await db.weakTopics.where('status').equals(source === 'weak' ? 'quiz' : 'retest').toArray()
  for (const w of pending) {
    if (byTopic.has(w.topicId) || (source === 'retest' && (w.retestAt ?? 0) > now)) continue
    await db.weakTopics.update(w.id, source === 'weak'
      ? { status: 'retest', retestAt: tomorrow(), updatedAt: now }
      : { status: 'cleared', retestAt: null, updatedAt: now })
  }
}
