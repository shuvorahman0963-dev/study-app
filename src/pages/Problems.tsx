import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageTitle } from '../components/Layout'
import ProblemEditor from '../components/ProblemEditor'
import RichText from '../components/RichText'
import StepSolver from '../components/StepSolver'
import { db, type Problem, type ProblemResult } from '../db'
import { mixedSet } from '../lib/practice'

const RESULT_ICON: Record<ProblemResult, string> = { solved: '✅', partial: '🟡', failed: '❌' }

/** Last attempt result per problem. */
async function lastResults(subjectId: number) {
  const attempts = await db.problemAttempts.where({ subjectId }).sortBy('at')
  return new Map(attempts.map((a) => [a.problemId, a.result]))
}

export default function Problems() {
  const subjectId = Number(useParams().id)
  const nav = useNavigate()
  const subject = useLiveQuery(() => db.subjects.get(subjectId), [subjectId])
  const chapters = useLiveQuery(() => db.chapters.where({ subjectId }).sortBy('order'), [subjectId])
  const topics = useLiveQuery(() => db.topics.where({ subjectId }).sortBy('order'), [subjectId])
  const problems = useLiveQuery(() => db.problems.where({ subjectId }).toArray(), [subjectId])
  const last = useLiveQuery(() => lastResults(subjectId), [subjectId])
  const [adding, setAdding] = useState(false)

  if (!subject || !chapters || !topics || !problems || !last) return null
  const practiceCount = problems.filter((p) => p.kind === 'practice').length

  return (
    <div className="space-y-4">
      <PageTitle title="Problems" sub={`${subject.name} · ${problems.length} problems`} back={`/subject/${subjectId}`} />
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-primary" disabled={!problems.length} onClick={() => nav(`/practice?subject=${subjectId}`)}>🔀 Mixed practice</button>
        <button className="btn-ghost" onClick={() => setAdding(true)}>+ Add problem</button>
      </div>
      {problems.length > 0 && practiceCount === 0 && (
        <p className="text-xs text-amber-500">শুধু worked example আছে — mixed practice-এ এগুলোর সমাধান লুকানো থাকবে।</p>
      )}

      {chapters.map((ch) => {
        const chTopics = topics.filter((t) => t.chapterId === ch.id && problems.some((p) => p.topicId === t.id))
        if (!chTopics.length) return null
        return (
          <section key={ch.id} className="space-y-2">
            <h2 className="font-semibold">{ch.title}</h2>
            {chTopics.map((t) => (
              <div key={t.id} className="card space-y-2">
                <Link to={`/topic/${t.id}`} className="text-sm text-slate-500 hover:underline">{t.title}</Link>
                {problems.filter((p) => p.topicId === t.id).sort((a, b) => (a.kind === 'worked' ? -1 : 1) - (b.kind === 'worked' ? -1 : 1)).map((p) => (
                  <ProblemRow key={p.id} p={p} result={last.get(p.id)} />
                ))}
              </div>
            ))}
          </section>
        )
      })}

      {problems.length === 0 && <p className="card text-sm text-slate-500">এখনো কোনো problem নেই। "+ Add problem" দিয়ে worked example আর practice problem যোগ করুন, অথবা JSON ইমপোর্ট করুন।</p>}
      {adding && <ProblemEditor subjectId={subjectId} onClose={() => setAdding(false)} />}
    </div>
  )
}

export function ProblemRow({ p, result }: { p: Problem; result?: ProblemResult }) {
  return (
    <Link to={`/problem/${p.id}`} className="flex items-center gap-3 rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
      <span>{p.kind === 'worked' ? '📘' : '✏️'}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{p.title || p.problem.replace(/\$[^$]*\$/g, '…').slice(0, 80)}</span>
      {result && <span title={result}>{RESULT_ICON[result]}</span>}
    </Link>
  )
}

export function ProblemPage() {
  const id = Number(useParams().id)
  const problem = useLiveQuery(() => db.problems.get(id), [id])
  const siblings = useLiveQuery(async () => (problem ? db.problems.where({ topicId: problem.topicId }).toArray() : []), [problem?.topicId])
  const topic = useLiveQuery(async () => (problem ? db.topics.get(problem.topicId) : undefined), [problem?.topicId])
  const [tryIt, setTryIt] = useState(false)
  const [editing, setEditing] = useState(false)

  if (!problem || !siblings) return null
  const hidden = problem.kind === 'practice' || tryIt
  const similar = siblings.filter((p) => p.id !== problem.id && p.kind === 'practice')

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <PageTitle title={problem.title || 'Problem'} sub={topic?.title} back={`/problems/${problem.subjectId}`} />
        <button className="btn-ghost px-3! py-2! text-sm" onClick={() => setEditing(true)}>Edit</button>
      </div>
      {problem.kind === 'worked' && (
        <button className="btn-ghost w-full text-sm" onClick={() => setTryIt(!tryIt)}>
          {tryIt ? '📘 Show full worked solution' : '🙈 Hide solution & try it myself'}
        </button>
      )}
      <StepSolver key={`${problem.id}-${hidden}`} problem={problem} hidden={hidden} mode="single" />
      {similar.length > 0 && (
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold">✏️ Similar practice problems</h2>
          {similar.map((p) => <ProblemRow key={p.id} p={p} />)}
        </div>
      )}
      {editing && <ProblemEditor subjectId={problem.subjectId} problem={problem} onClose={() => setEditing(false)} />}
    </div>
  )
}

export function Practice() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const subjects = useLiveQuery(() => db.subjects.toArray(), [])
  const [subjectId, setSubjectId] = useState(Number(params.get('subject')) || 0)
  const [count, setCount] = useState(5)
  const [set, setSet] = useState<Problem[] | null>(null)
  const [i, setI] = useState(0)
  const [results, setResults] = useState<ProblemResult[]>([])
  const chapterOf = useLiveQuery(async () => new Map((await db.topics.toArray()).map((t) => [t.id, t.chapterId])), [])
  const chapterTitle = useLiveQuery(async () => new Map((await db.chapters.toArray()).map((c) => [c.id, c.title])), [])

  if (set && i < set.length) {
    const p = set[i]
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button className="btn-ghost px-3! py-2! text-sm" onClick={() => confirm('Stop mixed practice?') && setSet(null)}>✕</button>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full bg-violet-500" style={{ width: `${(i / set.length) * 100}%` }} />
          </div>
          <span className="text-sm text-slate-500">{i + 1}/{set.length}</span>
        </div>
        <p className="text-xs text-slate-500">📂 {chapterTitle?.get(chapterOf?.get(p.topicId) ?? 0) ?? ''} — কোন পদ্ধতি লাগবে সেটা নিজে চিনুন</p>
        <StepSolver key={`${i}-${p.id}`} problem={p} hidden mode="mixed" onDone={(r) => setResults([...results, r])} />
        {results.length > i && (
          <button className="btn-primary w-full py-4! text-lg" onClick={() => setI(i + 1)}>{i + 1 === set.length ? 'Finish' : 'Next problem →'}</button>
        )}
      </div>
    )
  }

  if (set) {
    const solved = results.filter((r) => r === 'solved').length
    return (
      <div className="space-y-4 pt-6 text-center">
        <div className="text-5xl font-bold text-violet-500">{solved}/{set.length}</div>
        <p className="text-slate-500">solved without help · {results.filter((r) => r === 'partial').length} partly</p>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={async () => { setSet(await mixedSet(subjectId, count)); setI(0); setResults([]) }}>Again</button>
          <button className="btn-primary flex-1" onClick={() => nav(results.some((r) => r !== 'solved') ? '/weak' : '/')}>
            {results.some((r) => r !== 'solved') ? 'Weak topics' : 'Home'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Mixed practice" sub="Problems from different chapters, shuffled" />
      <div className="card space-y-3">
        <select className="input" value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
          <option value={0}>— Choose subject —</option>
          {subjects?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="grid grid-cols-3 gap-2">
          {[5, 10, 15].map((n) => <button key={n} className={count === n ? 'btn-primary' : 'btn-ghost'} onClick={() => setCount(n)}>{n}</button>)}
        </div>
        <button className="btn-primary w-full text-lg" disabled={!subjectId}
          onClick={async () => {
            const s = await mixedSet(subjectId, count)
            if (!s.length) return alert('এই সাবজেক্টে কোনো problem নেই।')
            setSet(s); setI(0); setResults([])
          }}>
          ▶ Start
        </button>
      </div>
      <p className="text-xs text-slate-500">বিভিন্ন chapter মিশিয়ে দিলে পরীক্ষায় "কোন সূত্র লাগবে" চেনার দক্ষতা বাড়ে (interleaving)।</p>
    </div>
  )
}
