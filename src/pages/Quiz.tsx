import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ExplainButton from '../components/ExplainButton'
import { PageTitle } from '../components/Layout'
import RichText from '../components/RichText'
import { db, type QuizSource, type StudyCard } from '../db'
import { keywordMatch, makeQuestions, shuffle, weightedPick, type Question, type QuizType } from '../lib/quiz'
import { finishWeakQuiz, markWeak } from '../lib/weak'

const WEAK_QUIZ_SIZE = 10

/** Cards for a weak/retest quiz: missed cards first, then the rest of those topics. */
async function weakCards(source: 'weak' | 'retest'): Promise<StudyCard[]> {
  const now = Date.now()
  const weak = (await db.weakTopics.where('status').equals(source === 'weak' ? 'quiz' : 'retest').toArray())
    .filter((w) => source === 'weak' || (w.retestAt ?? 0) <= now)
  const missed = new Set(weak.flatMap((w) => w.missedCardIds))
  const cards = await db.cards.where('topicId').anyOf(weak.map((w) => w.topicId)).toArray()
  const first = shuffle(cards.filter((c) => missed.has(c.id)))
  const rest = shuffle(cards.filter((c) => !missed.has(c.id)))
  return [...first, ...rest].slice(0, WEAK_QUIZ_SIZE)
}

interface Answer {
  card: StudyCard
  correct: boolean
}

/** Remount on query change so going from one quiz type to another starts fresh. */
export default function QuizRoute() {
  const [params] = useSearchParams()
  return <Quiz key={params.toString()} />
}

function Quiz() {
  const [params] = useSearchParams()
  const source = (params.get('source') as QuizSource) || 'quiz'
  const subjects = useLiveQuery(() => db.subjects.toArray(), [])
  const [subjectId, setSubjectId] = useState(Number(params.get('subject')) || 0)
  const [count, setCount] = useState(10)
  const [type, setType] = useState<QuizType>('mixed')
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const topicParam = Number(params.get('topic')) || 0

  const start = async (src: QuizSource) => {
    let picked: StudyCard[]
    if (src === 'quiz') {
      const all = topicParam
        ? await db.cards.where({ topicId: topicParam }).toArray()
        : subjectId
          ? await db.cards.where({ subjectId }).toArray()
          : await db.cards.toArray()
      const topics = new Map((await db.topics.toArray()).map((t) => [t.id, t]))
      picked = weightedPick(all.filter((c) => c.back.trim()), count, topics)
    } else {
      picked = await weakCards(src)
      // No flashcards in those topics: still advance them so they don't get stuck.
      if (!picked.length) await finishWeakQuiz(src, [])
    }
    setAnswers([])
    setQuestions(await makeQuestions(picked, src === 'quiz' ? type : 'mixed'))
  }

  // Weak and retest quizzes start immediately.
  useEffect(() => {
    if (source !== 'quiz') start(source)
  }, [source])

  if (questions && answers.length < questions.length) {
    return (
      <QuestionView
        key={answers.length}
        q={questions[answers.length]}
        index={answers.length}
        total={questions.length}
        onAnswer={async (correct) => {
          const card = questions[answers.length].card
          await db.quizResults.add({
            cardId: card.id, subjectId: card.subjectId, topicId: card.topicId, correct,
            mode: questions[answers.length].mode, source, at: Date.now(),
          } as never)
          if (!correct && source === 'quiz') await markWeak(card)
          const next = [...answers, { card, correct }]
          if (next.length === questions.length && source !== 'quiz') {
            await finishWeakQuiz(source, next.map((a) => ({ cardId: a.card.id, topicId: a.card.topicId, correct: a.correct })))
          }
          setAnswers(next)
        }}
      />
    )
  }

  if (questions) return <Result answers={answers} source={source} onAgain={() => setQuestions(null)} />

  if (source !== 'quiz') return <p className="pt-8 text-center text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <PageTitle title="Quiz" sub="Multiple choice + short answer from your cards" />
      <div className="card space-y-3">
        {topicParam ? (
          <p className="text-sm text-slate-500">Quiz on one topic</p>
        ) : (
          <label className="block text-sm">
            Subject
            <select className="input mt-1" value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
              <option value={0}>All subjects</option>
              {subjects?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <div className="grid grid-cols-3 gap-2">
          {[10, 20, 30].map((n) => (
            <button key={n} className={count === n ? 'btn-primary' : 'btn-ghost'} onClick={() => setCount(n)}>{n} Q</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['mixed', 'mcq', 'short'] as QuizType[]).map((t) => (
            <button key={t} className={`${type === t ? 'btn-primary' : 'btn-ghost'} px-2! text-sm`} onClick={() => setType(t)}>
              {t === 'mixed' ? 'Mixed' : t === 'mcq' ? 'MCQ' : 'Short'}
            </button>
          ))}
        </div>
        <button className="btn-primary w-full text-lg" onClick={() => start('quiz')}>▶ Start quiz</button>
      </div>
      <p className="text-xs text-slate-500">ভুল উত্তরগুলো স্বয়ংক্রিয়ভাবে "Weak topics"-এ জমা হবে।</p>
    </div>
  )
}

function QuestionView({ q, index, total, onAnswer }: { q: Question; index: number; total: number; onAnswer: (correct: boolean) => void }) {
  const nav = useNavigate()
  const [chosen, setChosen] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [checked, setChecked] = useState(false)
  const [verdict, setVerdict] = useState<boolean | null>(null)
  const topic = useLiveQuery(() => db.topics.get(q.card.topicId), [q.card.topicId])
  const answered = q.mode === 'mcq' ? chosen !== null : verdict !== null
  const match = checked ? keywordMatch(q.card.back, typed) : null

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-3">
      <div className="flex items-center gap-3">
        <button className="btn-ghost px-3! py-2! text-sm" onClick={() => confirm('Quit this quiz?') && nav('/')}>✕</button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div className="h-full bg-indigo-500" style={{ width: `${(index / total) * 100}%` }} />
        </div>
        <span className="text-sm text-slate-500">{index + 1}/{total}</span>
      </div>
      <div className="text-xs text-slate-500">{topic?.title} · {q.mode === 'mcq' ? 'Multiple choice' : 'Short answer'}</div>
      <div className="card">
        <RichText text={q.card.front} className="text-lg font-semibold" />
        {q.card.frontImage && <img src={q.card.frontImage} alt="" className="mt-2 max-h-60 rounded-lg" />}
      </div>

      {q.mode === 'mcq' &&
        q.options.map((opt, i) => {
          const isRight = opt === q.card.back
          const style =
            chosen === null ? 'border-slate-300 dark:border-slate-700'
            : isRight ? 'border-emerald-500 bg-emerald-500/10'
            : i === chosen ? 'border-rose-500 bg-rose-500/10'
            : 'border-slate-300 opacity-50 dark:border-slate-700'
          return (
            <button key={i} disabled={chosen !== null} className={`rounded-xl border-2 p-3 text-left text-sm ${style}`}
              onClick={() => setChosen(i)}>
              <RichText text={opt} />
            </button>
          )
        })}

      {q.mode === 'short' && (
        <>
          <textarea className="input min-h-28" placeholder="উত্তর লিখুন…" value={typed} disabled={checked} onChange={(e) => setTyped(e.target.value)} autoFocus />
          {!checked ? (
            <button className="btn-primary w-full" onClick={() => setChecked(true)}>Check answer</button>
          ) : (
            <>
              <div className="card space-y-2 border-indigo-500/50!">
                <div className="text-xs font-semibold text-indigo-500">Model answer</div>
                <RichText text={q.card.back} />
                {match && (
                  <p className="text-xs text-slate-500">
                    Keyword match: <b>{match.pct}%</b>
                    {match.missing.length > 0 && <> · missing: {match.missing.slice(0, 8).join(', ')}</>}
                  </p>
                )}
              </div>
              {verdict === null && (
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn bg-rose-600 text-white" onClick={() => setVerdict(false)}>✗ I missed it</button>
                  <button className="btn bg-emerald-600 text-white" onClick={() => setVerdict(true)}>✓ I got it</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {answered && (
        <>
          <div className={`text-center font-semibold ${(q.mode === 'mcq' ? q.options[chosen!] === q.card.back : verdict) ? 'text-emerald-500' : 'text-rose-500'}`}>
            {(q.mode === 'mcq' ? q.options[chosen!] === q.card.back : verdict) ? '✅ Correct!' : '❌ Wrong — added to weak topics'}
          </div>
          <ExplainButton target={{ kind: 'card', id: q.card.id }} extra={{ myAnswer: q.mode === 'short' ? typed : q.options[chosen!] }} />
          <div className="flex-1" />
          <button className="btn-primary w-full py-4! text-lg"
            onClick={() => onAnswer(q.mode === 'mcq' ? q.options[chosen!] === q.card.back : !!verdict)}>
            {index + 1 === total ? 'Finish' : 'Next →'}
          </button>
        </>
      )}
    </div>
  )
}

function Result({ answers, source, onAgain }: { answers: Answer[]; source: QuizSource; onAgain: () => void }) {
  const right = answers.filter((a) => a.correct).length
  const pct = answers.length ? Math.round((right / answers.length) * 100) : 0
  const wrong = answers.filter((a) => !a.correct)

  if (answers.length === 0) {
    return (
      <div className="space-y-4 pt-8 text-center">
        <h1 className="text-xl font-bold">No questions available</h1>
        <p className="text-sm text-slate-500">{source === 'quiz' ? 'এই সাবজেক্টে কার্ড নেই।' : 'এখন কোনো weak topic quiz/retest বাকি নেই।'}</p>
        <Link to={source === 'quiz' ? '/' : '/weak'} className="btn-primary w-full">Back</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="pt-4 text-center">
        <div className="text-5xl font-bold text-indigo-500">{pct}%</div>
        <p className="text-slate-500">{right} / {answers.length} correct</p>
      </div>
      {source === 'weak' && <p className="card text-sm">📅 এই topic-গুলোর <b>retest আগামীকাল</b> নির্ধারিত হলো।</p>}
      {source === 'retest' && <p className="card text-sm">৮০% বা বেশি পাওয়া topic-গুলো cleared। বাকিগুলো আবার "explain" ধাপে ফিরে গেছে।</p>}
      {wrong.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Wrong answers</h2>
          {wrong.map((a) => (
            <div key={a.card.id} className="card space-y-1 text-sm">
              <RichText text={a.card.front} className="font-semibold" />
              <RichText text={a.card.back} className="text-slate-500" />
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        {source === 'quiz' && <button className="btn-ghost flex-1" onClick={onAgain}>New quiz</button>}
        <Link to={wrong.length && source === 'quiz' ? '/weak' : '/'} className="btn-primary flex-1">
          {wrong.length && source === 'quiz' ? 'Go to weak topics' : 'Home'}
        </Link>
      </div>
    </div>
  )
}
