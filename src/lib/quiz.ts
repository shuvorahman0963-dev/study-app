import { db, type StudyCard, type Topic } from '../db'

export type QuizType = 'mixed' | 'mcq' | 'short'

export interface Question {
  card: StudyCard
  mode: 'mcq' | 'short'
  options: string[] // MCQ only; contains card.back once
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Random pick weighted by past-paper frequency, so frequent topics show up more. */
export function weightedPick(cards: StudyCard[], n: number, topics: Map<number, Topic>): StudyCard[] {
  const keyed = cards.map((c) => {
    const w = 1 + (topics.get(c.topicId)?.pastPaperFrequency ?? 0)
    return { c, k: Math.pow(Math.random(), 1 / w) }
  })
  return keyed.sort((a, b) => b.k - a.k).slice(0, n).map((x) => x.c)
}

const norm = (s: string) => s.trim().toLowerCase()

/** Distractors come from the same topic first, then chapter-mates (same subject). */
function distractors(card: StudyCard, pool: StudyCard[]): string[] {
  const seen = new Set([norm(card.back)])
  const out: string[] = []
  const sameTopic = shuffle(pool.filter((c) => c.topicId === card.topicId))
  const sameSubject = shuffle(pool.filter((c) => c.topicId !== card.topicId && c.subjectId === card.subjectId))
  for (const c of [...sameTopic, ...sameSubject]) {
    if (out.length === 3) break
    if (!c.back.trim() || seen.has(norm(c.back))) continue
    seen.add(norm(c.back))
    out.push(c.back)
  }
  return out
}

export async function makeQuestions(picked: StudyCard[], type: QuizType): Promise<Question[]> {
  const subjectIds = [...new Set(picked.map((c) => c.subjectId))]
  const pool = (await db.cards.where('subjectId').anyOf(subjectIds).toArray()).filter((c) => c.back.trim())
  return picked.map((card, i) => {
    const wantMcq = type === 'mcq' || (type === 'mixed' && i % 2 === 0)
    const d = wantMcq ? distractors(card, pool) : []
    // Not enough distinct answers for 4 options → ask it as short answer instead.
    if (wantMcq && d.length === 3) return { card, mode: 'mcq', options: shuffle([card.back, ...d]) }
    return { card, mode: 'short', options: [] }
  })
}

const STOP = new Set('the and for are with that this from into than then they them their there which when what where while have has had was were will would been being also only each such some more most other over under very about your onto upon used uses using'.split(' '))

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/\$[^$]*\$/g, ' ')
    .match(/[a-z0-9ঀ-৿₀-₉]+/g)
    ?.filter((w) => w.length > 3 && !STOP.has(w)) ?? []

/** Share of the model answer's keywords that appear in the typed answer (a hint, not a verdict). */
export function keywordMatch(model: string, typed: string): { pct: number; missing: string[] } {
  const keys = [...new Set(words(model))]
  if (!keys.length) return { pct: 0, missing: [] }
  const have = new Set(words(typed))
  const missing = keys.filter((k) => !have.has(k))
  return { pct: Math.round(((keys.length - missing.length) / keys.length) * 100), missing }
}
