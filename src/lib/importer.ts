import { db, type SubjectType } from '../db'
import { newFsrsCard } from './scheduler'

/** Shape produced by the Claude Project export prompt (study-data/PROMPT.md). */
export interface ExportFile {
  version?: number
  part?: number
  totalParts?: number
  subject: { name: string; code?: string; type?: string; examDate?: string }
  chapters?: {
    title: string
    topics?: {
      title: string
      pastPaperFrequency?: number
      marks?: number
      notes?: string
      cards?: { front: string; back: string; tags?: string[] }[]
      problems?: { kind?: string; title?: string; problem: string; steps?: string[]; answer?: string }[]
    }[]
  }[]
  pastPapers?: {
    year: number
    exam?: string
    questions?: { text: string; marks?: number; chapter?: string; topic?: string }[]
  }[]
}

export interface ImportResult {
  subject: string
  chapters: number
  topics: number
  cards: number
  problems: number
  pastQuestions: number
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Merges one export file into the database. Re-importing the same file adds nothing twice. */
export async function importExport(data: ExportFile): Promise<ImportResult> {
  if (!data?.subject?.name) throw new Error('JSON-এ "subject.name" নেই — ফাইলটা ঠিক ফরম্যাটে কিনা দেখুন।')
  const res: ImportResult = { subject: data.subject.name, chapters: 0, topics: 0, cards: 0, problems: 0, pastQuestions: 0 }
  const now = Date.now()

  await db.transaction('rw', [db.subjects, db.chapters, db.topics, db.cards, db.problems, db.pastQuestions], async () => {
    const s = data.subject
    const type: SubjectType = s.type?.trim().toLowerCase().startsWith('math') ? 'math' : 'theory'
    let subject = (await db.subjects.toArray()).find((x) => same(x.name, s.name))
    if (!subject) {
      const id = await db.subjects.add({ name: s.name.trim(), code: s.code ?? '', type, examDate: s.examDate ?? '', createdAt: now } as never)
      subject = (await db.subjects.get(id))!
    } else {
      // Only fill in fields the file actually provides, so a later part never wipes the exam date.
      const patch: Record<string, string> = {}
      if (s.code) patch.code = s.code
      if (s.examDate) patch.examDate = s.examDate
      if (s.type) patch.type = type
      if (Object.keys(patch).length) await db.subjects.update(subject.id, patch)
    }
    const subjectId = subject.id

    const chapters = await db.chapters.where({ subjectId }).toArray()
    const topics = await db.topics.where({ subjectId }).toArray()

    for (const ch of data.chapters ?? []) {
      let chapter = chapters.find((x) => same(x.title, ch.title))
      if (!chapter) {
        const id = await db.chapters.add({ subjectId, title: ch.title.trim(), order: chapters.length } as never)
        chapter = (await db.chapters.get(id))!
        chapters.push(chapter)
        res.chapters++
      }
      for (const tp of ch.topics ?? []) {
        let topic = topics.find((x) => x.chapterId === chapter!.id && same(x.title, tp.title))
        const meta = {
          pastPaperFrequency: tp.pastPaperFrequency ?? 0,
          marks: tp.marks ?? 0,
          notes: tp.notes ?? '',
        }
        if (!topic) {
          const order = topics.filter((x) => x.chapterId === chapter!.id).length
          const id = await db.topics.add({ subjectId, chapterId: chapter.id, title: tp.title.trim(), order, myNotes: '', ...meta } as never)
          topic = (await db.topics.get(id))!
          topics.push(topic)
          res.topics++
        } else {
          await db.topics.update(topic.id, meta)
        }
        const topicId = topic.id

        const existingCards = await db.cards.where({ topicId }).toArray()
        for (const c of tp.cards ?? []) {
          if (!c.front?.trim() || existingCards.some((x) => same(x.front, c.front))) continue
          await db.cards.add({
            subjectId, topicId, front: c.front.trim(), back: (c.back ?? '').trim(), tags: c.tags ?? [],
            myNotes: '', fsrs: newFsrsCard(), createdAt: now,
          } as never)
          res.cards++
        }

        const existingProblems = await db.problems.where({ topicId }).toArray()
        for (const p of tp.problems ?? []) {
          if (!p.problem?.trim() || existingProblems.some((x) => same(x.problem, p.problem))) continue
          await db.problems.add({
            subjectId, topicId, kind: p.kind === 'practice' ? 'practice' : 'worked', title: p.title ?? '',
            problem: p.problem.trim(), steps: p.steps ?? [], answer: p.answer ?? '', myNotes: '',
          } as never)
          res.problems++
        }
      }
    }

    const existingQ = await db.pastQuestions.where({ subjectId }).toArray()
    for (const paper of data.pastPapers ?? []) {
      for (const q of paper.questions ?? []) {
        if (!q.text?.trim()) continue
        if (existingQ.some((x) => x.year === paper.year && same(x.text, q.text))) continue
        const topic = q.topic ? topics.find((x) => same(x.title, q.topic!)) : undefined
        const row = { subjectId, topicId: topic?.id ?? null, year: paper.year, exam: paper.exam ?? '', text: q.text.trim(), marks: q.marks ?? 0 }
        await db.pastQuestions.add(row as never)
        existingQ.push({ ...row, id: -1 })
        res.pastQuestions++
      }
    }
  })
  return res
}

/** Accepts one export object, an array of them, or raw JSON text (code fences are stripped). */
export async function importText(text: string): Promise<ImportResult[]> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    throw new Error('JSON পড়া গেল না: ' + (e as Error).message)
  }
  const list = (Array.isArray(parsed) ? parsed : [parsed]) as ExportFile[]
  const out: ImportResult[] = []
  for (const item of list) out.push(await importExport(item))
  return out
}
