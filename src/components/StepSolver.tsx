import { useState } from 'react'
import { db, type Problem, type ProblemResult } from '../db'
import { markWeakTopic } from '../lib/weak'
import ExplainButton from './ExplainButton'
import RichText from './RichText'

interface Props {
  problem: Problem
  /** true = solution hidden and revealed step by step (practice / mixed mode). */
  hidden: boolean
  mode: 'single' | 'mixed'
  onDone?: (result: ProblemResult) => void
}

const RESULTS: { r: ProblemResult; label: string; cls: string }[] = [
  { r: 'failed', label: "✗ Couldn't", cls: 'bg-rose-600' },
  { r: 'partial', label: '~ Partly', cls: 'bg-amber-600' },
  { r: 'solved', label: '✓ Solved', cls: 'bg-emerald-600' },
]

export default function StepSolver({ problem, hidden, mode, onDone }: Props) {
  const total = problem.steps.length
  const [shown, setShown] = useState(hidden ? 0 : total)
  const [answerShown, setAnswerShown] = useState(!hidden)
  const [rated, setRated] = useState<ProblemResult | null>(null)

  const rate = async (r: ProblemResult) => {
    setRated(r)
    await db.problemAttempts.add({
      problemId: problem.id, subjectId: problem.subjectId, topicId: problem.topicId,
      result: r, stepsRevealed: shown, mode, at: Date.now(),
    } as never)
    if (r !== 'solved') await markWeakTopic(problem.subjectId, problem.topicId)
    onDone?.(r)
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded px-1.5 py-0.5 font-semibold ${problem.kind === 'worked' ? 'bg-sky-500/15 text-sky-500' : 'bg-violet-500/15 text-violet-500'}`}>
            {problem.kind === 'worked' ? '📘 Worked example' : '✏️ Practice'}
          </span>
          {problem.title && <span className="text-slate-500">{problem.title}</span>}
        </div>
        <RichText text={problem.problem} className="text-lg" />
        {problem.image && <img src={problem.image} alt="" className="max-h-72 rounded-lg" />}
      </div>

      {hidden && shown === 0 && !answerShown && (
        <p className="text-center text-sm text-slate-500">খাতায় নিজে সমাধান করুন। আটকে গেলে একটা করে step দেখুন।</p>
      )}

      {shown > 0 && (
        <ol className="card list-decimal space-y-2 pl-8">
          {problem.steps.slice(0, shown).map((s, i) => (
            <li key={i} className={i === shown - 1 && hidden ? 'animate-[pulse_0.6s_ease-out_1]' : ''}><RichText text={s} /></li>
          ))}
        </ol>
      )}

      {answerShown && problem.answer && (
        <div className="card border-emerald-500/50!">
          <span className="text-xs font-semibold text-emerald-500">Final answer</span>
          <RichText text={problem.answer} className="font-semibold" />
        </div>
      )}

      {hidden && (shown < total || !answerShown) && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost" disabled={shown >= total} onClick={() => setShown(shown + 1)}>
            👣 Next step ({shown}/{total})
          </button>
          <button className="btn-ghost" disabled={answerShown} onClick={() => setAnswerShown(true)}>🎯 Show answer</button>
        </div>
      )}

      {hidden && !rated && (
        <>
          <p className="text-center text-xs text-slate-500">কেমন হলো? (যত কম step দেখেছেন তত ভালো)</p>
          <div className="grid grid-cols-3 gap-2">
            {RESULTS.map((x) => (
              <button key={x.r} className={`btn px-1! text-sm text-white ${x.cls}`} onClick={() => rate(x.r)}>{x.label}</button>
            ))}
          </div>
        </>
      )}
      {rated && rated !== 'solved' && <p className="text-center text-sm text-rose-500">Topic added to weak topics 🎯</p>}

      <ExplainButton target={{ kind: 'problem', id: problem.id }} className="w-full" />

      {problem.myNotes && (
        <details className="card text-sm">
          <summary className="cursor-pointer font-semibold text-slate-500">📝 My notes</summary>
          <RichText text={problem.myNotes} className="mt-2" />
        </details>
      )}
    </div>
  )
}
