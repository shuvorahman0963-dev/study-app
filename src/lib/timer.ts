import { useSyncExternalStore } from 'react'
import { db } from '../db'

export type Phase = 'study' | 'break'

export interface TimerState {
  phase: Phase
  subjectId: number
  running: boolean
  endAt: number | null // set while running
  remainingMs: number // used while paused
  plannedMs: number // length of the current block (may be shortened by the sleep guard)
  studyMin: number
  breakMin: number
  cycles: number // study blocks finished in this run
}

const KEY = 'focus-timer'
const MIN = 60_000

const initial: TimerState = {
  phase: 'study', subjectId: 0, running: false, endAt: null,
  remainingMs: 25 * MIN, plannedMs: 25 * MIN, studyMin: 25, breakMin: 5, cycles: 0,
}

function load(): TimerState {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...initial, ...JSON.parse(raw) } : initial
  } catch {
    return initial
  }
}

let state = load()
const listeners = new Set<() => void>()

function set(patch: Partial<TimerState>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export const getTimer = () => state
export const remaining = (s = state, now = Date.now()) => (s.running && s.endAt ? Math.max(0, s.endAt - now) : s.remainingMs)

export function useTimer() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export function setDurations(studyMin: number, breakMin: number) {
  const patch: Partial<TimerState> = { studyMin, breakMin }
  // Apply immediately if the current block hasn't started yet.
  if (!state.running && state.remainingMs === state.plannedMs) {
    const ms = (state.phase === 'study' ? studyMin : breakMin) * MIN
    Object.assign(patch, { remainingMs: ms, plannedMs: ms })
  }
  set(patch)
}

export const setSubject = (subjectId: number) => set({ subjectId })

/** capMs shortens a fresh study block (sleep guard). */
export function start(capMs?: number) {
  let rem = state.remainingMs
  let planned = state.plannedMs
  if (capMs !== undefined && rem === planned && capMs < rem) {
    rem = capMs
    planned = capMs
  }
  set({ running: true, endAt: Date.now() + rem, remainingMs: rem, plannedMs: planned })
}

export function pause() {
  if (!state.running) return
  set({ running: false, endAt: null, remainingMs: remaining() })
}

export function reset() {
  const ms = state.studyMin * MIN
  set({ phase: 'study', running: false, endAt: null, remainingMs: ms, plannedMs: ms, cycles: 0 })
}

/** Ends the current block early (counts studied minutes so far). */
export async function skip() {
  await finishBlock(state.plannedMs - remaining())
}

async function finishBlock(studiedMs: number) {
  if (state.phase === 'study') {
    const minutes = Math.round(studiedMs / MIN)
    if (minutes > 0) await db.focusSessions.add({ subjectId: state.subjectId, minutes, at: Date.now() } as never)
    const ms = state.breakMin * MIN
    set({ phase: 'break', running: true, endAt: Date.now() + ms, remainingMs: ms, plannedMs: ms, cycles: state.cycles + 1 })
    alertUser('Break time ☕', `${minutes} min done. ${state.breakMin} min break.`)
  } else {
    const ms = state.studyMin * MIN
    set({ phase: 'study', running: false, endAt: null, remainingMs: ms, plannedMs: ms })
    alertUser('Back to study 📚', 'Break is over. Press Start when ready.')
  }
}

let finishing = false
/** Called every second by the global runner; finishes the block when time is up. */
export async function tick() {
  if (!state.running || finishing || remaining() > 0) return
  finishing = true
  try {
    await finishBlock(state.plannedMs)
  } finally {
    finishing = false
  }
}

export function beep() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = 880
      g.gain.setValueAtTime(0.25, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.3)
    })
  } catch {
    /* audio unavailable */
  }
}

export async function notify(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const options = { body, icon: './icon-192.png', badge: './icon-192.png' }
  try {
    // Android only shows notifications through the service worker.
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) return await reg.showNotification(title, options)
    new Notification(title, options)
  } catch {
    /* notifications unavailable */
  }
}

function alertUser(title: string, body: string) {
  beep()
  notify(title, body)
}

export const fmtClock = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
