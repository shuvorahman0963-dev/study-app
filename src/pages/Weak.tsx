import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ExplainButton from '../components/ExplainButton'
import { PageTitle } from '../components/Layout'
import RichText from '../components/RichText'
import { db, type StudyCard, type Topic, type WeakTopic } from '../db'

interface Row {
  w: WeakTopic
  topic?: Topic
  subject?: string
  missed: StudyCard[]
}

async function loadRows(): Promise<Row[]> {
  const weak = await db.weakTopics.where('status').notEqual('cleared').toArray()
  const subjects = new Map((await db.subjects.toArray()).map((s) => [s.id, s.name]))
  return Promise.all(
    weak.map(async (w) => ({
      w,
      topic: await db.topics.get(w.topicId),
      subject: subjects.get(w.subjectId),
      missed: (await db.cards.bulkGet(w.missedCardIds)).filter(Boolean) as StudyCard[],
    })),
  )
}

export default function Weak() {
  const nav = useNavigate()
  const rows = useLiveQuery(loadRows, [])
  const cleared = useLiveQuery(() => db.weakTopics.where('status').equals('cleared').count(), [])
  if (!rows) return null

  const now = Date.now()
  const explain = rows.filter((r) => r.w.status === 'explain')
  const ready = rows.filter((r) => r.w.status === 'quiz')
  const retestDue = rows.filter((r) => r.w.status === 'retest' && (r.w.retestAt ?? 0) <= now)
  const waiting = rows.filter((r) => r.w.status === 'retest' && (r.w.retestAt ?? 0) > now)

  return (
    <div className="space-y-4">
      <PageTitle title="Weak topics" sub="Explain → 10-question quiz → retest tomorrow" />

      {rows.length === 0 && (
        <div className="card text-center text-sm text-slate-500">
          🎉 কোনো weak topic নেই। Quiz দিলে ভুল উত্তরগুলো এখানে আসবে।{cleared ? ` (${cleared} cleared)` : ''}
          <Link to="/quiz" className="btn-primary mt-3 w-full">Take a quiz</Link>
        </div>
      )}

      {retestDue.length > 0 && (
        <div className="card space-y-2 border-amber-500!">
          <h2 className="font-semibold">🔁 Retest due today</h2>
          <p className="text-sm text-slate-500">{retestDue.map((r) => r.topic?.title).join(', ')}</p>
          <button className="btn-primary w-full" onClick={() => nav('/quiz?source=retest')}>Start retest</button>
        </div>
      )}

      {explain.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">① Explain in your own words</h2>
          <p className="text-sm text-slate-500">নোট না দেখে প্রতিটা topic নিজের ভাষায় ব্যাখ্যা করুন। তারপর model answer-এর সাথে মিলিয়ে নিন।</p>
          {explain.map((r) => <ExplainBox key={r.w.id} row={r} />)}
        </section>
      )}

      {ready.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">② Weak-topic quiz</h2>
          {ready.map((r) => (
            <div key={r.w.id} className="card space-y-2">
              <TopicHeader row={r} />
              <details>
                <summary className="cursor-pointer text-sm text-indigo-500">Compare: my explanation vs model answers</summary>
                <div className="mt-2 space-y-2 text-sm">
                  <p className="whitespace-pre-wrap rounded-lg bg-slate-100 p-2 dark:bg-slate-800">{r.w.explanation || '—'}</p>
                  {r.missed.map((c) => (
                    <div key={c.id}>
                      <RichText text={c.front} className="font-semibold" />
                      <RichText text={c.back} className="text-slate-500" />
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ))}
          <button className="btn-primary w-full text-lg" onClick={() => nav('/quiz?source=weak')}>
            ▶ Start 10-question quiz ({ready.length} topics)
          </button>
        </section>
      )}

      {waiting.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">③ Retest scheduled</h2>
          {waiting.map((r) => (
            <div key={r.w.id} className="card flex items-center justify-between gap-2 text-sm">
              <span>{r.topic?.title}</span>
              <span className="text-slate-500">📅 {new Date(r.w.retestAt!).toLocaleDateString()}</span>
            </div>
          ))}
        </section>
      )}

      {cleared ? <p className="text-center text-xs text-slate-500">✅ {cleared} topics cleared so far</p> : null}
    </div>
  )
}

function TopicHeader({ row }: { row: Row }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <Link to={`/topic/${row.w.topicId}`} className="font-semibold hover:underline">{row.topic?.title ?? 'Topic'}</Link>
        <div className="text-xs text-slate-500">{row.subject} · {row.missed.length} missed</div>
      </div>
    </div>
  )
}

function ExplainBox({ row }: { row: Row }) {
  const [text, setText] = useState(row.w.explanation)
  return (
    <div className="card space-y-3">
      <TopicHeader row={row} />
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {row.missed.map((c) => <li key={c.id}><RichText text={c.front} /></li>)}
      </ul>
      <textarea className="input min-h-32" value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Explain this in your own words without notes… (বাংলা/English যেকোনোটা)" />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary flex-1" disabled={text.trim().length < 10}
          onClick={() => db.weakTopics.update(row.w.id, { explanation: text.trim(), status: 'quiz', updatedAt: Date.now() })}>
          Save & compare
        </button>
        <ExplainButton target={{ kind: 'topic', id: row.w.topicId }}
          extra={{ heading: 'Questions I got wrong', lines: row.missed.map((c) => c.front), myAnswer: text }} />
      </div>
    </div>
  )
}
