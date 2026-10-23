import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { PageTitle } from '../components/Layout'
import { subjectProgress, type SubjectProgress } from '../lib/progress'
import { fmtMinutes } from '../lib/sleep'
import { ExamBadge } from './Home'

const readinessColor = (r: number) => (r >= 70 ? 'text-emerald-500' : r >= 40 ? 'text-amber-500' : 'text-rose-500')

export default function Progress() {
  const data = useLiveQuery(() => subjectProgress(), [])
  if (!data) return null

  return (
    <div className="space-y-4">
      <PageTitle title="Progress" sub="Readiness = memory on exam day · coverage · accuracy" />
      {data.length === 0 && <p className="text-sm text-slate-500">No subjects yet.</p>}
      {data
        .slice()
        .sort((a, b) => a.readiness - b.readiness)
        .map((p) => <SubjectCard key={p.subject.id} p={p} />)}
    </div>
  )
}

function SubjectCard({ p }: { p: SubjectProgress }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link to={`/subject/${p.subject.id}`} className="font-semibold hover:underline">{p.subject.name}</Link>
          <div className="mt-1"><ExamBadge examDate={p.subject.examDate} /></div>
        </div>
        <div className="text-right">
          <div className={`text-4xl font-bold leading-none ${readinessColor(p.readiness)}`}>{p.readiness}</div>
          <div className="text-[11px] text-slate-500">readiness</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="topics covered" value={`${Math.round(p.coverage * 100)}%`} sub={`${p.topicsCovered}/${p.topicsTotal}`} />
        <Stat label="memory on exam day" value={`${Math.round(p.memory * 100)}%`} />
        <Stat label="accuracy (7d)" value={p.accuracy7 === null ? '—' : `${Math.round(p.accuracy7 * 100)}%`} sub={fmtMinutes(p.focusMin7) + ' focus'} />
      </div>

      <Bar label="Coverage" value={p.coverage} />

      <div>
        <div className="mb-1 text-xs text-slate-500">Accuracy trend (last 14 days)</div>
        <Trend trend={p.trend} />
      </div>

      {p.weakTopics.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-slate-500">Weak topics</div>
          <div className="flex flex-wrap gap-1">
            {p.weakTopics.map((t, i) => (
              <Link key={i} to="/weak" className="rounded-lg bg-rose-500/15 px-2 py-1 text-xs text-rose-500">{t}</Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-100 p-2 dark:bg-slate-800">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] leading-tight text-slate-500">{label}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  )
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{label}</span><span>{Math.round(value * 100)}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-indigo-500" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  )
}

/** One bar per day; height = accuracy, faded when there were few answers. */
function Trend({ trend }: { trend: SubjectProgress['trend'] }) {
  if (!trend.some((d) => d.total)) return <p className="text-xs text-slate-500">No answers yet — review or quiz to see your trend.</p>
  return (
    <div className="flex h-20 items-end gap-1">
      {trend.map((d) => {
        const acc = d.total ? d.correct / d.total : 0
        const color = acc >= 0.8 ? 'bg-emerald-500' : acc >= 0.6 ? 'bg-amber-500' : 'bg-rose-500'
        return (
          <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${new Date(d.day).toLocaleDateString()}: ${d.correct}/${d.total}`}>
            {d.total ? (
              <div className={`rounded-t ${color}`} style={{ height: `${Math.max(6, acc * 100)}%`, opacity: d.total < 5 ? 0.5 : 1 }} />
            ) : (
              <div className="h-1 rounded bg-slate-200 dark:bg-slate-800" />
            )}
          </div>
        )
      })}
    </div>
  )
}
