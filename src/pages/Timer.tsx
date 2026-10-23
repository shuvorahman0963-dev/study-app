import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { PageTitle } from '../components/Layout'
import { toast } from '../components/Toast'
import { db } from '../db'
import { currentSleepState, fmtMinutes } from '../lib/sleep'
import { startOfToday } from '../lib/scheduler'
import { fmtClock, pause, remaining, reset, setDurations, setSubject, skip, start, useTimer } from '../lib/timer'

export default function Timer() {
  const t = useTimer()
  const subjects = useLiveQuery(() => db.subjects.toArray(), [])
  const todayMin = useLiveQuery(
    async () => (await db.focusSessions.where('at').aboveOrEqual(startOfToday()).toArray()).reduce((a, s) => a + s.minutes, 0),
    [t.cycles],
  )
  const [, setNow] = useState(0)

  // Redraw the clock every second while running.
  useEffect(() => {
    if (!t.running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [t.running])

  const ms = remaining(t)
  const pct = t.plannedMs ? 1 - ms / t.plannedMs : 0
  const fresh = ms === t.plannedMs
  const isStudy = t.phase === 'study'

  /** Sleep guard: never let a study block run past bedtime. */
  const onStart = async () => {
    if (!isStudy || !fresh) return start()
    const sleep = await currentSleepState()
    if (sleep.asleep) {
      if (!confirm(`🌙 এখন ঘুমের সময় (${sleep.bedtime})। ঘুম না হলে পড়া মনে থাকে না।\n\nতবুও কি পড়বেন?`)) return
      return start()
    }
    if (sleep.minutesLeft < t.studyMin) {
      if (sleep.minutesLeft < 5) return toast(`🌙 Bedtime in ${sleep.minutesLeft} min — time to sleep`)
      toast(`🌙 Bedtime soon — block shortened to ${sleep.minutesLeft} min`)
      return start(sleep.minutesLeft * 60_000)
    }
    start()
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Focus timer" sub={`Today: ${fmtMinutes(todayMin ?? 0)} focused`} />

      <select className="input" value={t.subjectId} onChange={(e) => setSubject(Number(e.target.value))} disabled={t.running}>
        <option value={0}>— Choose subject —</option>
        {subjects?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      <div className="card flex flex-col items-center gap-4 py-8">
        <div className={`rounded-full px-3 py-1 text-sm font-semibold ${isStudy ? 'bg-indigo-500/15 text-indigo-500' : 'bg-emerald-500/15 text-emerald-500'}`}>
          {isStudy ? '📚 Study' : '☕ Break'} · round {t.cycles + (isStudy ? 1 : 0)}
        </div>
        <div className="relative h-56 w-56">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="45" fill="none" strokeWidth="6" className="stroke-slate-200 dark:stroke-slate-800" />
            <circle cx="50" cy="50" r="45" fill="none" strokeWidth="6" strokeLinecap="round"
              className={isStudy ? 'stroke-indigo-500' : 'stroke-emerald-500'}
              strokeDasharray={2 * Math.PI * 45} strokeDashoffset={2 * Math.PI * 45 * (1 - pct)} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-5xl font-bold tabular-nums">{fmtClock(ms)}</div>
        </div>
        <div className="grid w-full grid-cols-3 gap-2">
          <button className="btn-ghost" onClick={reset}>Reset</button>
          {t.running ? (
            <button className="btn-primary" onClick={pause}>Pause</button>
          ) : (
            <button className="btn-primary" onClick={onStart} disabled={isStudy && !t.subjectId}>Start</button>
          )}
          <button className="btn-ghost" onClick={() => skip()} disabled={fresh && !t.running}>Skip</button>
        </div>
        {isStudy && !t.subjectId && <p className="text-xs text-amber-500">আগে সাবজেক্ট বেছে নিন</p>}
      </div>

      <div className="card grid grid-cols-2 gap-3">
        <label className="text-sm">
          Study (min)
          <input className="input mt-1" type="number" min={1} max={120} value={t.studyMin}
            onChange={(e) => setDurations(Math.max(1, Number(e.target.value) || 25), t.breakMin)} />
        </label>
        <label className="text-sm">
          Break (min)
          <input className="input mt-1" type="number" min={1} max={60} value={t.breakMin}
            onChange={(e) => setDurations(t.studyMin, Math.max(1, Number(e.target.value) || 5))} />
        </label>
      </div>
      <p className="text-center text-xs text-slate-500">টাইমার শেষ হলে শব্দ হবে। অন্য পেজে গেলেও টাইমার চলতে থাকবে।</p>
    </div>
  )
}
