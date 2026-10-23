import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Grade } from 'ts-fsrs'
import ExplainButton from '../components/ExplainButton'
import RichText from '../components/RichText'
import { db, getSetting, setSetting } from '../db'
import { isNew, previewIntervals, Rating, rateCard, State } from '../lib/scheduler'
import { markWeak } from '../lib/weak'
import { buildSession, loadSession, saveSession, type Session } from '../lib/session'

const BUTTONS: { g: Grade; label: string; cls: string; key: string }[] = [
  { g: Rating.Again, label: 'Again', cls: 'bg-rose-600 hover:bg-rose-500', key: '1' },
  { g: Rating.Hard, label: 'Hard', cls: 'bg-amber-600 hover:bg-amber-500', key: '2' },
  { g: Rating.Good, label: 'Good', cls: 'bg-emerald-600 hover:bg-emerald-500', key: '3' },
  { g: Rating.Easy, label: 'Easy', cls: 'bg-sky-600 hover:bg-sky-500', key: '4' },
]

/** Missed cards return a few cards later in the same session. */
const REINSERT_GAP = 3

export default function Review() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [session, setSession] = useState<Session | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [finished, setFinished] = useState<Session | null>(null)
  const typeMode = useLiveQuery(() => getSetting('typeAnswer', true), [])

  // Resume an unfinished session first; only build a new one when none is pending.
  useEffect(() => {
    setFinished(null)
    ;(async () => {
      const existing = loadSession()
      if (existing && existing.queue.length) return setSession(existing)
      const s = await buildSession({
        subjectId: Number(params.get('subject')) || undefined,
        topicId: Number(params.get('topic')) || undefined,
      })
      if (s.queue.length) saveSession(s)
      setSession(s)
    })()
  }, [params])

  const currentId = session?.queue[0]
  const card = useLiveQuery(() => (currentId ? db.cards.get(currentId) : undefined), [currentId])
  const topic = useLiveQuery(() => (card ? db.topics.get(card.topicId) : undefined), [card?.topicId])
  const subject = useLiveQuery(() => (card ? db.subjects.get(card.subjectId) : undefined), [card?.subjectId])

  const update = (s: Session) => {
    if (s.queue.length === 0) {
      saveSession(null)
      setFinished(s)
    } else saveSession(s)
    setSession(s)
    setRevealed(false)
    setTyped('')
  }

  // A card deleted mid-session is simply dropped from the queue.
  useEffect(() => {
    if (session && currentId && card === undefined) {
      db.cards.get(currentId).then((c) => {
        if (!c) update({ ...session, queue: session.queue.slice(1), total: session.total - 1 })
      })
    }
  }, [card, currentId])

  const rate = useCallback(
    async (g: Grade) => {
      if (!session || !card || !revealed) return
      // Forgetting a card that was already learned counts as a weak spot.
      if (g === Rating.Again && card.fsrs.state === State.Review) await markWeak(card)
      const fsrs = rateCard(card, g, subject)
      await db.cards.update(card.id, { fsrs })
      await db.reviewLogs.add({
        cardId: card.id, subjectId: card.subjectId, topicId: card.topicId,
        rating: g, correct: g !== Rating.Again, wasNew: isNew(card), at: Date.now(),
      } as never)
      const rest = session.queue.slice(1)
      const missedBefore = session.missedIds.includes(card.id)
      const next: Session = { ...session, queue: rest }
      if (g === Rating.Again) {
        rest.splice(Math.min(REINSERT_GAP, rest.length), 0, card.id)
        next.misses++
        if (!missedBefore) next.missedIds = [...session.missedIds, card.id]
      } else if (!missedBefore) next.correctFirstTry++
      update(next)
    },
    [session, card, revealed, subject],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement)?.tagName === 'TEXTAREA'
      if (!revealed && ((e.key === ' ' && !inField) || (e.key === 'Enter' && (e.ctrlKey || !inField)))) {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed && !inField) {
        const b = BUTTONS.find((x) => x.key === e.key)
        if (b) rate(b.g)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, rate])

  if (finished) {
    const pct = finished.total ? Math.round((finished.correctFirstTry / finished.total) * 100) : 0
    return (
      <div className="space-y-4 pt-8 text-center">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-bold">Session complete!</h1>
        <div className="card grid grid-cols-3 gap-2">
          <div><div className="text-2xl font-bold">{finished.total}</div><div className="text-xs text-slate-500">cards</div></div>
          <div><div className="text-2xl font-bold text-emerald-500">{pct}%</div><div className="text-xs text-slate-500">first try</div></div>
          <div><div className="text-2xl font-bold text-rose-500">{finished.missedIds.length}</div><div className="text-xs text-slate-500">relearned</div></div>
        </div>
        <p className="text-sm text-slate-500">সব কার্ড অন্তত একবার সঠিক হয়েছে। ভুল কার্ডগুলো আবার শীঘ্রই আসবে।</p>
        <Link to="/" className="btn-primary w-full">Back to Home</Link>
      </div>
    )
  }

  if (!session) return null

  if (session.queue.length === 0) {
    return (
      <div className="space-y-4 pt-8 text-center">
        <div className="text-5xl">✅</div>
        <h1 className="text-xl font-bold">Nothing to review right now</h1>
        <p className="text-sm text-slate-500">কোনো due বা নতুন কার্ড নেই।</p>
        <Link to="/" className="btn-primary w-full">Back to Home</Link>
      </div>
    )
  }

  if (!card) return null
  const done = session.total - session.queue.length
  const intervals = revealed ? previewIntervals(card, subject) : null
  const isRepeat = session.missedIds.includes(card.id)

  return (
    <div className="flex min-h-[calc(100dvh-2.5rem)] flex-col gap-3">
      <div className="flex items-center gap-3">
        <button className="btn-ghost px-3! py-2! text-sm" onClick={() => nav('/')} title="Session is kept; resume from Home">⏸ Pause</button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(done / Math.max(1, session.total)) * 100}%` }} />
        </div>
        <span className="text-sm tabular-nums text-slate-500">{session.queue.length} left</span>
      </div>

      <div className="text-xs text-slate-500">
        {subject?.name} › {topic?.title}
        {isRepeat && <span className="ml-2 rounded bg-rose-600/20 px-1.5 py-0.5 text-rose-500">relearn</span>}
        {isNew(card) && <span className="ml-2 rounded bg-emerald-600/20 px-1.5 py-0.5 text-emerald-500">new</span>}
      </div>

      <div className="card space-y-3">
        <RichText text={card.front} className="text-lg font-semibold" />
        {card.frontImage && <img src={card.frontImage} alt="" className="max-h-72 rounded-lg" />}
      </div>

      {!revealed && (
        <>
          {typeMode && (
            <textarea
              className="input min-h-28"
              placeholder="নোট না দেখে উত্তর লিখুন… (Ctrl+Enter = reveal)"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
            />
          )}
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <input type="checkbox" checked={!!typeMode} onChange={(e) => setSetting('typeAnswer', e.target.checked)} />
            Type my answer first
          </label>
          <div className="flex-1" />
          <button className="btn-primary w-full py-4! text-lg" onClick={() => setRevealed(true)}>Show answer</button>
        </>
      )}

      {revealed && (
        <>
          {typed.trim() && (
            <div className="card border-dashed! text-sm">
              <div className="mb-1 text-xs font-semibold text-slate-500">Your answer</div>
              <p className="whitespace-pre-wrap">{typed}</p>
            </div>
          )}
          <div className="card space-y-3 border-indigo-500/50!">
            <div className="text-xs font-semibold text-indigo-500">Model answer</div>
            <RichText text={card.back} />
            {card.backImage && <img src={card.backImage} alt="" className="max-h-72 rounded-lg" />}
          </div>
          {card.myNotes && (
            <details className="card text-sm">
              <summary className="cursor-pointer font-semibold text-slate-500">📝 My notes</summary>
              <RichText text={card.myNotes} className="mt-2" />
            </details>
          )}
          <ExplainButton target={{ kind: 'card', id: card.id }} extra={{ myAnswer: typed }} />
          <div className="flex-1" />
          <p className="text-center text-xs text-slate-500">নিজের উত্তর মিলিয়ে সৎভাবে রেট করুন</p>
          <div className="grid grid-cols-4 gap-2">
            {BUTTONS.map((b) => (
              <button key={b.g} className={`btn flex-col gap-0! px-1! py-3! text-white ${b.cls}`} onClick={() => rate(b.g)}>
                <span>{b.label}</span>
                <span className="text-xs font-normal opacity-80">{intervals?.[b.g]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
