import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db'
import { importExport } from '../lib/importer'
import { promptInstall, useCanInstall } from '../lib/install'
import { buildPlan, type PlanItem } from '../lib/plan'
import { sampleData } from '../lib/sample'
import { daysLeft } from '../lib/scheduler'
import { countsBySubject, loadSession } from '../lib/session'
import { fmtMinutes } from '../lib/sleep'

export function ExamBadge({ examDate }: { examDate: string }) {
  const left = daysLeft(examDate)
  if (left === null) return <span className="text-xs text-slate-500">Exam date not set</span>
  const color = left <= 3 ? 'bg-rose-600' : left <= 7 ? 'bg-amber-500' : 'bg-emerald-600'
  const text = left < 0 ? 'Exam over' : left === 0 ? 'Exam today' : `${left} days left`
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${color}`}>{text}</span>
}

const KIND_ICON: Record<PlanItem['kind'], string> = { retest: '🔁', review: '🔄', weak: '🎯', new: '🆕', practice: '🧮' }

/** Re-renders every minute so countdowns and the bedtime cut-off stay current. */
function useMinuteTick() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  return tick
}

export default function Home() {
  const nav = useNavigate()
  const tick = useMinuteTick()
  const subjects = useLiveQuery(() => db.subjects.toArray(), [])
  const counts = useLiveQuery(() => countsBySubject(), [tick])
  const plan = useLiveQuery(() => buildPlan(), [tick])
  const [showLater, setShowLater] = useState(false)
  const canInstall = useCanInstall()
  // Re-read on every render so it updates after returning from a review.
  const session = loadSession()
  const busy = !!session?.queue.length

  if (!subjects || !counts || !plan) return null

  if (subjects.length === 0) {
    return (
      <div className="space-y-4 pt-8 text-center">
        <h1 className="text-3xl font-bold">📖 Study App</h1>
        <p className="text-slate-500">এখনো কোনো সাবজেক্ট নেই। আপনার JSON ইমপোর্ট করুন, অথবা sample data দিয়ে চেষ্টা করুন।</p>
        <Link to="/settings" className="btn-primary w-full">Import JSON</Link>
        <button className="btn-ghost w-full" onClick={async () => { for (const s of sampleData()) await importExport(s) }}>
          Load sample data
        </button>
      </div>
    )
  }

  const upcoming = subjects
    .map((s) => ({ s, left: daysLeft(s.examDate) }))
    .sort((a, b) => (a.left ?? 999) - (b.left ?? 999))
  const planMinutes = plan.today.reduce((a, i) => a + i.minutes, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Today</h1>
          <p className="text-xs text-slate-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <Link to="/settings" className="btn-ghost px-3! py-2!" aria-label="Settings">⚙️</Link>
      </div>

      {canInstall && (
        <button className="btn-primary w-full" onClick={promptInstall}>📲 Install app (works offline)</button>
      )}

      {/* Countdown */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {upcoming.map(({ s, left }) => (
          <Link key={s.id} to={`/subject/${s.id}`}
            className={`min-w-28 shrink-0 rounded-2xl p-3 text-white ${left === null ? 'bg-slate-600' : left < 0 ? 'bg-slate-700 opacity-60' : left <= 3 ? 'bg-rose-600' : left <= 7 ? 'bg-amber-600' : 'bg-emerald-700'}`}>
            <div className="text-3xl font-bold leading-none">{left === null ? '—' : left < 0 ? '✓' : left}</div>
            <div className="text-[11px] opacity-90">{left === null ? 'set exam date' : left < 0 ? 'done' : left === 0 ? 'TODAY' : 'days left'}</div>
            <div className="mt-1 truncate text-xs font-semibold">{s.code || s.name}</div>
          </Link>
        ))}
      </div>

      {busy && (
        <div className="card border-amber-500!">
          <p className="font-semibold">⏸️ Unfinished review — {session!.queue.length} {session!.queue.length === 1 ? 'card' : 'cards'} left</p>
          <p className="mb-3 text-sm text-slate-500">সব কার্ড সঠিক না হওয়া পর্যন্ত সেশন শেষ হবে না।</p>
          <button className="btn-primary w-full" onClick={() => nav('/review')}>Resume review</button>
        </div>
      )}

      {/* Today's plan */}
      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">📋 Today's plan</h2>
          <span className="text-xs text-slate-500">{fmtMinutes(planMinutes)} · bed {plan.sleep.bedtime}</span>
        </div>

        {plan.sleep.asleep ? (
          <p className="rounded-xl bg-indigo-500/10 p-3 text-sm">🌙 এখন ঘুমের সময় ({plan.sleep.bedtime})। ঘুমের মধ্যেই মস্তিষ্ক পড়া মনে রাখে — কাল সকালে আবার শুরু করুন।</p>
        ) : plan.today.length === 0 && plan.later.length === 0 ? (
          <p className="text-sm text-slate-500">✅ আজকের সব কাজ শেষ! চাইলে একটা quiz দিন।</p>
        ) : plan.today.length === 0 ? (
          <p className="text-sm text-amber-500">ঘুমের আগে আর সময় নেই ({fmtMinutes(plan.sleep.minutesLeft)} বাকি)। বাকি কাজ কালকের জন্য রাখা হলো।</p>
        ) : (
          <p className="text-xs text-slate-500">ঘুমের আগে {fmtMinutes(plan.budget)} সময় আছে — সেই অনুযায়ী সাজানো।</p>
        )}

        {plan.today.map((it) => <PlanRow key={it.id} it={it} disabled={busy && it.link.startsWith('/review')} />)}

        {plan.later.length > 0 && (
          <>
            <button className="text-sm text-indigo-500" onClick={() => setShowLater(!showLater)}>
              {showLater ? '▾' : '▸'} After bedtime / tomorrow ({plan.later.length})
            </button>
            {showLater && plan.later.map((it) => <PlanRow key={it.id} it={it} muted disabled={busy && it.link.startsWith('/review')} />)}
          </>
        )}
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Link to="/timer" className="btn-ghost flex-col gap-0! px-1! text-sm"><span className="text-xl">⏱️</span>Timer</Link>
        <Link to="/quiz" className="btn-ghost flex-col gap-0! px-1! text-sm"><span className="text-xl">❓</span>Quiz</Link>
        <Link to="/practice" className="btn-ghost flex-col gap-0! px-1! text-sm"><span className="text-xl">🔀</span>Practice</Link>
      </div>

      <h2 className="pt-2 text-lg font-semibold">Subjects</h2>
      {upcoming.map(({ s }) => {
        const c = counts.map.get(s.id) ?? { due: 0, fresh: 0, total: 0 }
        return (
          <div key={s.id} className="card">
            <Link to={`/subject/${s.id}`} className="block">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.code} · {s.type === 'math' ? 'Math' : 'Theory'} · {c.total} cards</div>
                </div>
                <ExamBadge examDate={s.examDate} />
              </div>
            </Link>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-sm text-slate-500">
                <b className="text-indigo-500">{c.due}</b> due · <b className="text-emerald-500">{c.fresh}</b> new
              </span>
              <button className="btn-ghost px-4! py-2!" disabled={busy || c.due + c.fresh === 0} onClick={() => nav(`/review?subject=${s.id}`)}>
                Review
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PlanRow({ it, muted, disabled }: { it: PlanItem; muted?: boolean; disabled?: boolean }) {
  const nav = useNavigate()
  return (
    <button disabled={disabled} onClick={() => nav(it.link)}
      className={`flex w-full items-center gap-3 rounded-xl bg-slate-100 p-3 text-left transition active:scale-[0.99] disabled:opacity-40 dark:bg-slate-800 ${muted ? 'opacity-60' : ''}`}>
      <span className="text-xl">{KIND_ICON[it.kind]}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{it.title}</span>
        <span className="block truncate text-xs text-slate-500">{it.sub}</span>
      </span>
      <span className="shrink-0 text-xs text-slate-500">~{it.minutes}m</span>
    </button>
  )
}
