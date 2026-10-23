import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Modal } from '../components/CardEditor'
import { PageTitle } from '../components/Layout'
import RichText from '../components/RichText'
import { db, type PastQuestion } from '../db'
import { fmtMinutes } from '../lib/sleep'
import { beep, fmtClock } from '../lib/timer'
import { markWeakTopic } from '../lib/weak'

const EXAM_KEY = 'paper-exam'

interface ExamState {
  subjectId: number
  year: number
  exam: string
  durationMin: number
  startedAt: number
  done: number[] // question ids marked attempted
}

function loadExam(): ExamState | null {
  try {
    const raw = localStorage.getItem(EXAM_KEY)
    return raw ? (JSON.parse(raw) as ExamState) : null
  } catch {
    return null
  }
}
function saveExam(s: ExamState | null) {
  try {
    if (s) localStorage.setItem(EXAM_KEY, JSON.stringify(s))
    else localStorage.removeItem(EXAM_KEY)
  } catch {
    /* ignore */
  }
}

const paperKey = (q: Pick<PastQuestion, 'year' | 'exam'>) => `${q.year}|${q.exam}`

export default function Papers() {
  const subjectId = Number(useParams().id)
  const nav = useNavigate()
  const subject = useLiveQuery(() => db.subjects.get(subjectId), [subjectId])
  const questions = useLiveQuery(() => db.pastQuestions.where({ subjectId }).toArray(), [subjectId])
  const topics = useLiveQuery(() => db.topics.where({ subjectId }).toArray(), [subjectId])
  const attempts = useLiveQuery(() => db.paperAttempts.where({ subjectId }).reverse().sortBy('at'), [subjectId])
  const [view, setView] = useState<'year' | 'topic'>('year')
  const [topicFilter, setTopicFilter] = useState(0)
  const [editing, setEditing] = useState<PastQuestion | 'new' | null>(null)
  const running = loadExam()

  if (!subject || !questions || !topics || !attempts) return null
  const topicTitle = new Map(topics.map((t) => [t.id, t.title]))
  const list = topicFilter ? questions.filter((q) => q.topicId === topicFilter) : questions

  const groups: [string, PastQuestion[]][] =
    view === 'year'
      ? [...new Set(list.map(paperKey))]
          .sort((a, b) => Number(b.split('|')[0]) - Number(a.split('|')[0]))
          .map((k) => [k.replace('|', ' · '), list.filter((q) => paperKey(q) === k)])
      : [...new Set(list.map((q) => q.topicId ?? 0))]
          .map((tid) => [topicTitle.get(tid) ?? 'No topic', list.filter((q) => (q.topicId ?? 0) === tid)] as [string, PastQuestion[]])
          .sort((a, b) => b[1].length - a[1].length)

  return (
    <div className="space-y-4">
      <PageTitle title="Past papers" sub={`${subject.name} · ${questions.length} questions`} back={`/subject/${subjectId}`} />

      {running && running.subjectId === subjectId ? (
        <button className="btn-primary w-full border-amber-500" onClick={() => nav(`/paper-exam/${subjectId}`)}>⏱️ Resume timed paper ({running.year})</button>
      ) : (
        <button className="btn-primary w-full" disabled={!questions.length} onClick={() => nav(`/paper-exam/${subjectId}`)}>⏱️ Timed full paper</button>
      )}

      <div className="flex gap-2">
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
          {(['year', 'topic'] as const).map((v) => (
            <button key={v} className={`rounded-lg py-2 text-sm font-medium ${view === v ? 'bg-white shadow dark:bg-slate-900' : 'text-slate-500'}`} onClick={() => setView(v)}>
              By {v}
            </button>
          ))}
        </div>
        <button className="btn-ghost px-3!" onClick={() => setEditing('new')}>+ Add</button>
      </div>
      <select className="input" value={topicFilter} onChange={(e) => setTopicFilter(Number(e.target.value))}>
        <option value={0}>All topics</option>
        {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
      </select>

      {groups.map(([label, qs]) => (
        <section key={label} className="card space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">{label}</h2>
            <span className="text-xs text-slate-500">{qs.length} Q{view === 'year' ? ` · ${qs.reduce((a, q) => a + q.marks, 0)} marks` : ''}</span>
          </div>
          {qs.map((q) => (
            <div key={q.id} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0 dark:border-slate-800">
              <RichText text={q.text} className="text-sm" />
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {q.marks > 0 && <span className="rounded bg-slate-100 px-1.5 dark:bg-slate-800">{q.marks} marks</span>}
                {view === 'topic' ? <span>{q.year} {q.exam}</span> : q.topicId && (
                  <Link to={`/topic/${q.topicId}`} className="text-indigo-500">{topicTitle.get(q.topicId)}</Link>
                )}
                <button className="ml-auto text-indigo-500" onClick={() => setEditing(q)}>Edit</button>
              </div>
            </div>
          ))}
        </section>
      ))}

      {attempts.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Timed paper history</h2>
          {attempts.map((a) => (
            <div key={a.id} className="flex justify-between text-sm">
              <span>{a.year} {a.exam} · {new Date(a.at).toLocaleDateString()}</span>
              <span className="font-semibold">{a.scored}/{a.total} · {fmtMinutes(a.usedMin)}</span>
            </div>
          ))}
        </section>
      )}

      {editing && <QuestionEditor subjectId={subjectId} q={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function QuestionEditor({ subjectId, q, onClose }: { subjectId: number; q?: PastQuestion; onClose: () => void }) {
  const topics = useLiveQuery(() => db.topics.where({ subjectId }).sortBy('order'), [subjectId])
  const [year, setYear] = useState(q?.year ?? new Date().getFullYear() - 1)
  const [exam, setExam] = useState(q?.exam ?? 'Term Final')
  const [text, setText] = useState(q?.text ?? '')
  const [marks, setMarks] = useState(q?.marks ?? 0)
  const [topicId, setTopicId] = useState(q?.topicId ?? 0)

  const save = async () => {
    const fields = { year, exam: exam.trim(), text: text.trim(), marks, topicId: topicId || null }
    if (q) await db.pastQuestions.update(q.id, fields)
    else await db.pastQuestions.add({ ...fields, subjectId } as never)
    onClose()
  }

  return (
    <Modal title={q ? 'Edit question' : 'Add past question'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input className="input" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} placeholder="Year" />
          <input className="input" value={exam} onChange={(e) => setExam(e.target.value)} placeholder="Exam (Term Final)" />
        </div>
        <textarea className="input min-h-28" value={text} onChange={(e) => setText(e.target.value)} placeholder="Question text" />
        <div className="grid grid-cols-2 gap-2">
          <input className="input" type="number" min={0} value={marks} onChange={(e) => setMarks(Number(e.target.value) || 0)} placeholder="Marks" />
          <select className="input" value={topicId} onChange={(e) => setTopicId(Number(e.target.value))}>
            <option value={0}>— Topic —</option>
            {topics?.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {q && <button className="btn-danger" onClick={async () => { if (confirm('Delete?')) { await db.pastQuestions.delete(q.id); onClose() } }}>Delete</button>}
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={!text.trim()} onClick={save}>Save</button>
        </div>
      </div>
    </Modal>
  )
}

/** Marks without a value count as 10 for scoring. */
const maxOf = (q: PastQuestion) => q.marks || 10

export function PaperExam() {
  const subjectId = Number(useParams().id)
  const nav = useNavigate()
  const questions = useLiveQuery(() => db.pastQuestions.where({ subjectId }).toArray(), [subjectId])
  const [exam, setExam] = useState<ExamState | null>(() => {
    const e = loadExam()
    return e && e.subjectId === subjectId ? e : null
  })
  const [pick, setPick] = useState('')
  const [duration, setDuration] = useState(180)
  const [grading, setGrading] = useState(false)
  const [scores, setScores] = useState<Record<number, number>>({})
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!exam || grading) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [exam, grading])

  const leftMs = exam ? exam.startedAt + exam.durationMin * 60_000 - now : 0
  useEffect(() => {
    if (exam && !grading && leftMs <= 0) {
      beep()
      setGrading(true)
    }
  }, [leftMs <= 0])

  if (!questions) return null
  const papers = [...new Set(questions.map(paperKey))].sort((a, b) => Number(b.split('|')[0]) - Number(a.split('|')[0]))

  // Setup
  if (!exam) {
    const key = pick || papers[0] || ''
    const qs = questions.filter((q) => paperKey(q) === key)
    return (
      <div className="space-y-4">
        <PageTitle title="Timed full paper" sub="খাতা-কলম নিয়ে বসুন, আসল পরীক্ষার মতো" back={`/papers/${subjectId}`} />
        <div className="card space-y-3">
          <label className="block text-sm">
            Paper
            <select className="input mt-1" value={key} onChange={(e) => setPick(e.target.value)}>
              {papers.map((k) => {
                const n = questions.filter((q) => paperKey(q) === k)
                return <option key={k} value={k}>{k.replace('|', ' · ')} — {n.length} Q</option>
              })}
            </select>
          </label>
          <label className="block text-sm">
            Time (minutes)
            <input className="input mt-1" type="number" min={5} value={duration} onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 60))} />
          </label>
          <p className="text-xs text-slate-500">{qs.length} questions · {qs.reduce((a, q) => a + q.marks, 0)} marks listed</p>
          <button className="btn-primary w-full text-lg" disabled={!qs.length}
            onClick={() => {
              const [y, ...rest] = key.split('|')
              const s = { subjectId, year: Number(y), exam: rest.join('|'), durationMin: duration, startedAt: Date.now(), done: [] }
              saveExam(s)
              setExam(s)
            }}>
            ▶ Start exam
          </button>
        </div>
      </div>
    )
  }

  const qs = questions.filter((q) => q.year === exam.year && q.exam === exam.exam)
  const update = (s: ExamState) => {
    saveExam(s)
    setExam(s)
  }

  // Self-grading
  if (grading) {
    const total = qs.reduce((a, q) => a + maxOf(q), 0)
    const scored = qs.reduce((a, q) => a + (scores[q.id] ?? 0), 0)
    const finish = async () => {
      const usedMin = Math.min(exam.durationMin, Math.round((Date.now() - exam.startedAt) / 60_000))
      await db.paperAttempts.add({ subjectId, year: exam.year, exam: exam.exam, durationMin: exam.durationMin, usedMin, scored, total, at: Date.now() } as never)
      for (const q of qs) if (q.topicId && (scores[q.id] ?? 0) < maxOf(q) / 2) await markWeakTopic(subjectId, q.topicId)
      saveExam(null)
      nav(`/papers/${subjectId}`)
    }
    return (
      <div className="space-y-4">
        <PageTitle title="Mark your paper" sub={`${exam.year} ${exam.exam} · model answer দেখে সৎভাবে নম্বর দিন`} />
        {qs.map((q, i) => (
          <div key={q.id} className="card space-y-2">
            <div className="flex gap-2"><b>{i + 1}.</b><RichText text={q.text} className="text-sm" /></div>
            <div className="flex items-center gap-2 text-sm">
              <input className="input w-24!" type="number" min={0} max={maxOf(q)} value={scores[q.id] ?? 0}
                onChange={(e) => setScores({ ...scores, [q.id]: Math.min(maxOf(q), Math.max(0, Number(e.target.value) || 0)) })} />
              <span className="text-slate-500">/ {maxOf(q)}</span>
              {q.topicId && <Link to={`/topic/${q.topicId}`} className="ml-auto text-xs text-indigo-500">topic cards →</Link>}
            </div>
          </div>
        ))}
        <div className="card text-center">
          <div className="text-3xl font-bold">{scored}/{total}</div>
          <div className="text-sm text-slate-500">{total ? Math.round((scored / total) * 100) : 0}% · অর্ধেকের কম পাওয়া topic-গুলো weak list-এ যাবে</div>
        </div>
        <button className="btn-primary w-full" onClick={finish}>Save result</button>
      </div>
    )
  }

  // Running
  const pct = Math.max(0, leftMs) / (exam.durationMin * 60_000)
  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-4 bg-slate-50/95 px-4 py-2 backdrop-blur dark:bg-slate-950/95">
        <div className="flex items-center justify-between">
          <span className="font-semibold">{exam.year} {exam.exam}</span>
          <span className={`text-2xl font-bold tabular-nums ${leftMs < 10 * 60_000 ? 'text-rose-500' : ''}`}>{fmtClock(Math.max(0, leftMs))}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div className="h-full bg-indigo-500" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
      {qs.map((q, i) => {
        const done = exam.done.includes(q.id)
        return (
          <button key={q.id} className={`card w-full text-left ${done ? 'opacity-50' : ''}`}
            onClick={() => update({ ...exam, done: done ? exam.done.filter((x) => x !== q.id) : [...exam.done, q.id] })}>
            <div className="flex gap-2">
              <span className="font-bold">{done ? '☑' : '☐'} {i + 1}.</span>
              <RichText text={q.text} />
            </div>
            {q.marks > 0 && <div className="mt-1 text-right text-xs text-slate-500">[{q.marks}]</div>}
          </button>
        )
      })}
      <p className="text-center text-xs text-slate-500">উত্তর খাতায় লিখুন। শেষ হলে প্রশ্নে চাপ দিয়ে ☑ করুন।</p>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-ghost" onClick={() => { if (confirm('Cancel this exam? Nothing will be saved.')) { saveExam(null); nav(`/papers/${subjectId}`) } }}>Cancel</button>
        <button className="btn-primary" onClick={() => confirm('Finish now and mark your paper?') && setGrading(true)}>Finish</button>
      </div>
    </div>
  )
}
