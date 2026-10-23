import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageTitle } from '../components/Layout'
import { db, deleteSubject, type SubjectType } from '../db'
import { isDue, isNew } from '../lib/scheduler'
import { loadSession } from '../lib/session'
import { ExamBadge } from './Home'

export default function SubjectPage() {
  const subjectId = Number(useParams().id)
  const nav = useNavigate()
  const subject = useLiveQuery(() => db.subjects.get(subjectId), [subjectId])
  const chapters = useLiveQuery(() => db.chapters.where({ subjectId }).sortBy('order'), [subjectId])
  const topics = useLiveQuery(() => db.topics.where({ subjectId }).sortBy('order'), [subjectId])
  const cards = useLiveQuery(() => db.cards.where({ subjectId }).toArray(), [subjectId])
  const problemCount = useLiveQuery(() => db.problems.where({ subjectId }).count(), [subjectId])
  const paperCount = useLiveQuery(() => db.pastQuestions.where({ subjectId }).count(), [subjectId])
  const [newChapter, setNewChapter] = useState('')
  const [open, setOpen] = useState<Record<number, boolean>>({})

  if (!subject || !chapters || !topics || !cards) return null

  const now = Date.now()
  const stat = (topicId: number) => {
    const list = cards.filter((c) => c.topicId === topicId)
    return { total: list.length, due: list.filter((c) => isDue(c, now)).length, fresh: list.filter(isNew).length }
  }
  const dueAll = cards.filter((c) => isDue(c, now)).length
  const newAll = cards.filter(isNew).length
  const busy = !!loadSession()?.queue.length

  const addChapter = async () => {
    if (!newChapter.trim()) return
    await db.chapters.add({ subjectId, title: newChapter.trim(), order: chapters.length } as never)
    setNewChapter('')
  }

  const addTopic = async (chapterId: number) => {
    const title = prompt('Topic title?')?.trim()
    if (!title) return
    const order = topics.filter((t) => t.chapterId === chapterId).length
    await db.topics.add({ subjectId, chapterId, title, order, pastPaperFrequency: 0, marks: 0, notes: '', myNotes: '' } as never)
  }

  return (
    <div className="space-y-4">
      <PageTitle title={subject.name} sub={`${subject.code} · ${cards.length} cards`} back="/subjects" />

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Exam date</span>
          <ExamBadge examDate={subject.examDate} />
        </div>
        <div className="flex gap-2">
          <input className="input" type="date" value={subject.examDate} onChange={(e) => db.subjects.update(subjectId, { examDate: e.target.value })} />
          <select className="input" value={subject.type} onChange={(e) => db.subjects.update(subjectId, { type: e.target.value as SubjectType })}>
            <option value="theory">Theory</option>
            <option value="math">Math</option>
          </select>
        </div>
        <button className="btn-primary w-full" disabled={busy || dueAll + newAll === 0} onClick={() => nav(`/review?subject=${subjectId}`)}>
          ▶ Review — {dueAll} due · {newAll} new
        </button>
        {busy && <p className="text-xs text-amber-500">আগে অসমাপ্ত review শেষ করুন (Home থেকে)।</p>}
        <div className="grid grid-cols-2 gap-2">
          <Link to={`/problems/${subjectId}`} className="btn-ghost px-2! text-sm">🧮 Problems ({problemCount ?? 0})</Link>
          <Link to={`/papers/${subjectId}`} className="btn-ghost px-2! text-sm">📝 Past papers ({paperCount ?? 0})</Link>
        </div>
        {(subject.type === 'math' || !!problemCount) && (
          <Link to={`/practice?subject=${subjectId}`} className="btn-ghost w-full text-sm">🔀 Mixed practice</Link>
        )}
      </div>

      {chapters.map((ch) => {
        const chTopics = topics.filter((t) => t.chapterId === ch.id)
        const isOpen = open[ch.id] ?? true
        return (
          <div key={ch.id} className="card p-0!">
            <button className="flex w-full items-center justify-between p-4 text-left" onClick={() => setOpen({ ...open, [ch.id]: !isOpen })}>
              <span className="font-semibold">{ch.title}</span>
              <span className="text-slate-500">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="border-t border-slate-200 dark:border-slate-800">
                {chTopics.map((t) => {
                  const s = stat(t.id)
                  return (
                    <Link key={t.id} to={`/topic/${t.id}`} className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800/60">
                      <div className="min-w-0">
                        <div className="truncate">{t.title}</div>
                        <div className="text-xs text-slate-500">
                          {s.total} cards · <span className="text-indigo-500">{s.due} due</span> · <span className="text-emerald-500">{s.fresh} new</span>
                        </div>
                      </div>
                      <FreqBadge freq={t.pastPaperFrequency} marks={t.marks} />
                    </Link>
                  )
                })}
                <button className="w-full px-4 py-3 text-left text-sm text-indigo-500" onClick={() => addTopic(ch.id)}>+ Add topic</button>
              </div>
            )}
          </div>
        )
      })}

      <div className="card flex gap-2">
        <input className="input" placeholder="New chapter title" value={newChapter} onChange={(e) => setNewChapter(e.target.value)} />
        <button className="btn-ghost" onClick={addChapter}>Add</button>
      </div>

      <button
        className="btn-danger w-full"
        onClick={async () => {
          if (!confirm(`"${subject.name}" এবং এর সব কার্ড মুছে যাবে। নিশ্চিত?`)) return
          await deleteSubject(subjectId)
          nav('/subjects')
        }}
      >
        Delete subject
      </button>
    </div>
  )
}

export function FreqBadge({ freq, marks }: { freq: number; marks: number }) {
  if (!freq && !marks) return null
  return (
    <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800" title="Past-paper frequency · marks">
      {'🔥'.repeat(Math.min(freq, 5)) || '·'} {marks ? `${marks}m` : ''}
    </span>
  )
}
