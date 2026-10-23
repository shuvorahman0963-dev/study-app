import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { db, getSetting } from '../db'
import { DEFAULT_BEDTIME, sleepState } from '../lib/sleep'
import { fmtClock, notify, remaining, tick, useTimer } from '../lib/timer'

const tabs = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/subjects', label: 'Subjects', icon: '📚' },
  { to: '/quiz', label: 'Quiz', icon: '❓' },
  { to: '/weak', label: 'Weak', icon: '🎯' },
  { to: '/timer', label: 'Timer', icon: '⏱️' },
  { to: '/progress', label: 'Progress', icon: '📈' },
]

/** Bedtime reminder shown 30 min before bed and during the sleep window. */
const REMIND_BEFORE_MIN = 30

/** Ticks once a second; kept in small components so the page itself doesn't re-render. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

/** Global clock that finishes focus blocks even when the timer page is closed. */
function TimerRunner() {
  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return null
}

function TimerPill({ inSession }: { inSession: boolean }) {
  const timer = useTimer()
  const now = useNow()
  return (
    <Link to="/timer"
      className={`fixed right-4 z-40 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg ${inSession ? 'bottom-4' : 'bottom-20'} ${timer.phase === 'study' ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
      {timer.phase === 'study' ? '📚' : '☕'} {fmtClock(remaining(timer, now))}
    </Link>
  )
}

function BedtimeBanner() {
  const bedtime = useLiveQuery(() => getSetting('bedtime', DEFAULT_BEDTIME), [])
  const now = useNow(30_000)
  const sleep = bedtime ? sleepState(bedtime, now) : null
  const remind = sleep && (sleep.asleep || sleep.minutesLeft <= REMIND_BEFORE_MIN)

  // Fire a system notification once per night when the reminder window opens.
  useEffect(() => {
    if (!remind || !sleep) return
    const key = `bed-notified-${new Date(sleep.bedAt).toDateString()}`
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch {
      return
    }
    notify('🌙 Bedtime soon', `Bedtime at ${sleep.bedtime}. Wrap up and sleep — sleep fixes memory.`)
  }, [remind])

  if (!remind || !sleep) return null
  return (
    <div className="bg-indigo-950 px-4 py-2 text-center text-sm text-indigo-100">
      🌙 {sleep.asleep ? `Bedtime (${sleep.bedtime}) — ঘুমাতে যান, কাল আবার পড়বেন।` : `Bedtime in ${sleep.minutesLeft} min — গুছিয়ে নিন।`}
    </div>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const weakCount = useLiveQuery(() => db.weakTopics.where('status').notEqual('cleared').count(), [])
  const timer = useTimer()
  // Review (and weak/retest quizzes) hide navigation so a session cannot be abandoned half-way.
  const inSession = pathname.startsWith('/review') || (pathname.startsWith('/quiz') && !!params.get('source'))

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <TimerRunner />
      <BedtimeBanner />
      <main className={`flex-1 px-4 pt-4 ${inSession ? 'pb-6' : 'pb-24'}`}>
        <Outlet />
      </main>

      {timer.running && !pathname.startsWith('/timer') && <TimerPill inSession={inSession} />}

      {!inSession && (
        <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-2xl pb-[env(safe-area-inset-bottom)]">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === '/'}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`
                }
              >
                <span className="relative text-xl">
                  {t.icon}
                  {t.to === '/weak' && !!weakCount && (
                    <span className="absolute -right-3 -top-1 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{weakCount}</span>
                  )}
                </span>
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}

export function PageTitle({ title, sub, back }: { title: string; sub?: string; back?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {back && (
        <NavLink to={back} className="btn-ghost px-3! py-2!" aria-label="Back">
          ←
        </NavLink>
      )}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        {sub && <p className="text-sm text-slate-500">{sub}</p>}
      </div>
    </div>
  )
}
