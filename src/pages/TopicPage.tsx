import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CardEditor, { SplitCard } from '../components/CardEditor'
import ExplainButton from '../components/ExplainButton'
import ProblemEditor from '../components/ProblemEditor'
import { ProblemRow } from './Problems'
import { PageTitle } from '../components/Layout'
import RichText from '../components/RichText'
import { db, type StudyCard } from '../db'
import { formatSpan, isNew } from '../lib/scheduler'
import { loadSession } from '../lib/session'

export default function TopicPage() {
  const topicId = Number(useParams().id)
  const nav = useNavigate()
  const topic = useLiveQuery(() => db.topics.get(topicId), [topicId])
  const chapter = useLiveQuery(async () => (topic ? db.chapters.get(topic.chapterId) : undefined), [topic?.chapterId])
  const cards = useLiveQuery(() => db.cards.where({ topicId }).toArray(), [topicId])
  const [editing, setEditing] = useState<StudyCard | 'new' | null>(null)
  const [splitting, setSplitting] = useState<StudyCard | null>(null)
  const [showBack, setShowBack] = useState(false)
  const [myNotes, setMyNotes] = useState('')
  const [addingProblem, setAddingProblem] = useState(false)
  const problems = useLiveQuery(() => db.problems.where({ topicId }).toArray(), [topicId])
  const pastQs = useLiveQuery(() => db.pastQuestions.where({ topicId }).toArray(), [topicId])

  // Follow saved notes (e.g. pasted from Claude) so a later blur can't overwrite them with stale text.
  useEffect(() => setMyNotes(topic?.myNotes ?? ''), [topic?.id, topic?.myNotes])

  if (!topic || !cards) return null
  const busy = !!loadSession()?.queue.length

  return (
    <div className="space-y-4">
      <PageTitle title={topic.title} sub={chapter?.title} back={`/subject/${topic.subjectId}`} />

      <div className="card space-y-3">
        <div className="flex gap-2">
          <label className="flex-1 text-sm">
            Past-paper frequency
            <input className="input mt-1" type="number" min={0} value={topic.pastPaperFrequency}
              onChange={(e) => db.topics.update(topicId, { pastPaperFrequency: Number(e.target.value) || 0 })} />
          </label>
          <label className="flex-1 text-sm">
            Marks
            <input className="input mt-1" type="number" min={0} value={topic.marks}
              onChange={(e) => db.topics.update(topicId, { marks: Number(e.target.value) || 0 })} />
          </label>
        </div>
        {topic.notes && <RichText text={topic.notes} className="text-sm text-slate-500" />}
        <button className="btn-primary w-full" disabled={busy || cards.length === 0} onClick={() => nav(`/review?topic=${topicId}`)}>
          ▶ Study this topic ({cards.length} cards)
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost px-3! py-2! text-sm" disabled={cards.length === 0} onClick={() => nav(`/quiz?topic=${topicId}`)}>❓ Quiz this topic</button>
          <ExplainButton target={{ kind: 'topic', id: topicId }} />
        </div>
      </div>

      <div className="card space-y-2">
        <label className="text-sm font-medium">My notes</label>
        <textarea className="input min-h-24" value={myNotes} onChange={(e) => setMyNotes(e.target.value)}
          onBlur={() => db.topics.update(topicId, { myNotes })} placeholder="নিজের নোট / Claude-এর ব্যাখ্যা এখানে পেস্ট করুন" />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cards</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showBack} onChange={(e) => setShowBack(e.target.checked)} /> Show answers
        </label>
      </div>

      {cards.map((c) => (
        <div key={c.id} className="card space-y-2">
          <RichText text={c.front} className="font-semibold" />
          {c.frontImage && <img src={c.frontImage} alt="" className="max-h-48 rounded-lg" />}
          {showBack && (
            <>
              <RichText text={c.back} className="text-sm text-slate-600 dark:text-slate-300" />
              {c.backImage && <img src={c.backImage} alt="" className="max-h-48 rounded-lg" />}
            </>
          )}
          {c.myNotes && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-500">📝 My notes</summary>
              <RichText text={c.myNotes} className="mt-1" />
            </details>
          )}
          <ExplainButton target={{ kind: 'card', id: c.id }} />
          <div className="flex items-center justify-between gap-2 pt-1 text-xs text-slate-500">
            <span>{isNew(c) ? 'New' : `Next: ${formatSpan(new Date(c.fsrs.due).getTime() - Date.now())}`}</span>
            <div className="flex gap-3 text-sm">
              <button className="text-indigo-500" onClick={() => setEditing(c)}>Edit</button>
              <button className="text-indigo-500" onClick={() => setSplitting(c)}>Split</button>
              <button className="text-rose-500" onClick={() => confirm('Delete this card?') && db.cards.delete(c.id)}>Delete</button>
            </div>
          </div>
        </div>
      ))}

      <button className="btn-ghost w-full" onClick={() => setEditing('new')}>+ Add card</button>

      <div className="flex items-center justify-between pt-2">
        <h2 className="text-lg font-semibold">🧮 Problems</h2>
        <button className="text-sm text-indigo-500" onClick={() => setAddingProblem(true)}>+ Add problem</button>
      </div>
      {problems && problems.length > 0 ? (
        <div className="space-y-2">{problems.map((p) => <ProblemRow key={p.id} p={p} />)}</div>
      ) : (
        <p className="text-sm text-slate-500">No problems for this topic.</p>
      )}

      {pastQs && pastQs.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">📝 Asked in past papers ({pastQs.length})</h2>
          {pastQs.sort((a, b) => b.year - a.year).map((q) => (
            <div key={q.id} className="border-t border-slate-100 pt-2 text-sm first:border-0 dark:border-slate-800">
              <RichText text={q.text} />
              <span className="text-xs text-slate-500">{q.year} {q.exam}{q.marks ? ` · ${q.marks} marks` : ''}</span>
            </div>
          ))}
        </section>
      )}
      {addingProblem && <ProblemEditor subjectId={topic.subjectId} topicId={topicId} onClose={() => setAddingProblem(false)} />}

      {editing && (
        <CardEditor subjectId={topic.subjectId} topicId={topicId} card={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      )}
      {splitting && <SplitCard card={splitting} onClose={() => setSplitting(null)} />}
    </div>
  )
}
