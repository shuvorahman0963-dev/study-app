import { db, type Problem } from '../db'
import { shuffle } from './quiz'

/**
 * Interleaved practice: shuffle problems inside each chapter, then deal them round-robin
 * so two problems in a row come from different chapters whenever possible.
 * Practice problems are used first; worked examples fill in (with solution hidden) if needed.
 */
export async function mixedSet(subjectId: number, n: number): Promise<Problem[]> {
  const problems = await db.problems.where({ subjectId }).toArray()
  const topics = new Map((await db.topics.where({ subjectId }).toArray()).map((t) => [t.id, t]))
  const practice = problems.filter((p) => p.kind === 'practice')
  const pool = practice.length >= n ? practice : [...practice, ...shuffle(problems.filter((p) => p.kind === 'worked'))].slice(0, Math.max(n, practice.length))

  const byChapter = new Map<number, Problem[]>()
  for (const p of shuffle(pool)) {
    const ch = topics.get(p.topicId)?.chapterId ?? 0
    byChapter.set(ch, [...(byChapter.get(ch) ?? []), p])
  }
  const queues = shuffle([...byChapter.values()])
  const out: Problem[] = []
  while (out.length < n && queues.some((q) => q.length)) {
    for (const q of queues) {
      const p = q.shift()
      if (p) out.push(p)
      if (out.length === n) break
    }
  }
  return out
}
