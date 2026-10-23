import { getSetting } from '../db'

export const DEFAULT_BEDTIME = '23:30'
/** Hours after bedtime that count as "should be asleep". */
const SLEEP_HOURS = 7
/** Plan stops this many minutes before bed to wind down. */
export const WIND_DOWN_MIN = 15

const HOUR = 60 * 60 * 1000

export interface SleepState {
  bedtime: string
  asleep: boolean // now is inside the sleep window
  minutesLeft: number // until next bedtime (0 when asleep)
  bedAt: number
}

export function sleepState(bedtime: string, now = Date.now()): SleepState {
  const [h, m] = (bedtime || DEFAULT_BEDTIME).split(':').map(Number)
  const base = new Date(now)
  base.setHours(h, m, 0, 0)
  // Check yesterday's, today's and tomorrow's bedtime so times after midnight (e.g. 00:30) work.
  for (const offset of [-1, 0, 1]) {
    const b = base.getTime() + offset * 24 * HOUR
    if (now >= b && now < b + SLEEP_HOURS * HOUR) return { bedtime, asleep: true, minutesLeft: 0, bedAt: b }
  }
  const next = [-1, 0, 1].map((o) => base.getTime() + o * 24 * HOUR).find((b) => b > now)!
  return { bedtime, asleep: false, minutesLeft: Math.floor((next - now) / 60000), bedAt: next }
}

export async function currentSleepState() {
  return sleepState(await getSetting('bedtime', DEFAULT_BEDTIME))
}

export function fmtMinutes(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
