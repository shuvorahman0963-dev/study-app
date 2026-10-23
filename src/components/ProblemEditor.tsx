import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Problem } from '../db'
import { fileToDataUrl } from '../lib/image'
import { Modal } from './CardEditor'
import RichText from './RichText'

interface Props {
  subjectId: number
  topicId?: number // preselected topic for a new problem
  problem?: Problem
  onClose: () => void
}

export default function ProblemEditor({ subjectId, topicId, problem, onClose }: Props) {
  const topics = useLiveQuery(() => db.topics.where({ subjectId }).sortBy('order'), [subjectId])
  const [tid, setTid] = useState(problem?.topicId ?? topicId ?? 0)
  const [kind, setKind] = useState<Problem['kind']>(problem?.kind ?? 'practice')
  const [title, setTitle] = useState(problem?.title ?? '')
  const [text, setText] = useState(problem?.problem ?? '')
  const [steps, setSteps] = useState((problem?.steps ?? []).join('\n'))
  const [answer, setAnswer] = useState(problem?.answer ?? '')
  const [image, setImage] = useState(problem?.image)
  const [preview, setPreview] = useState(false)

  const stepList = steps.split('\n').map((s) => s.trim()).filter(Boolean)
  const ok = tid && text.trim()

  const save = async () => {
    if (!ok) return
    const fields = { topicId: tid, kind, title: title.trim(), problem: text.trim(), steps: stepList, answer: answer.trim(), image }
    if (problem) await db.problems.update(problem.id, fields)
    else await db.problems.add({ ...fields, subjectId, myNotes: '' } as never)
    onClose()
  }

  return (
    <Modal title={problem ? 'Edit problem' : 'New problem'} onClose={onClose}>
      <div className="space-y-3">
        <select className="input" value={tid} onChange={(e) => setTid(Number(e.target.value))}>
          <option value={0}>— Topic —</option>
          {topics?.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          {(['worked', 'practice'] as const).map((k) => (
            <button key={k} className={kind === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setKind(k)}>
              {k === 'worked' ? '📘 Worked example' : '✏️ Practice'}
            </button>
          ))}
        </div>
        <input className="input" placeholder="Short title (e.g. Pressure at 5 m depth)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label className="block text-sm font-medium">Problem</label>
        <textarea className="input min-h-24" value={text} onChange={(e) => setText(e.target.value)} placeholder="Find ... given $\rho = 1000$ kg/m³" />
        <label className="btn-ghost cursor-pointer px-3! py-2! text-sm">
          🖼️ {image ? 'Change figure' : 'Add figure'}
          <input type="file" accept="image/*" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await fileToDataUrl(f)); e.target.value = '' }} />
        </label>
        {image && (
          <div className="flex items-center gap-3">
            <img src={image} alt="" className="h-16 rounded" />
            <button className="text-sm text-rose-500" onClick={() => setImage(undefined)}>Remove</button>
          </div>
        )}
        <label className="block text-sm font-medium">Solution steps — one step per line ({stepList.length})</label>
        <textarea className="input min-h-32 font-mono text-sm" value={steps} onChange={(e) => setSteps(e.target.value)}
          placeholder={'$p = \\rho g h$\n$p = 1000 \\times 9.81 \\times 5$\n$p = 49050$ Pa'} />
        <label className="block text-sm font-medium">Final answer</label>
        <input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="49.05 kPa" />
        <button className="text-sm text-indigo-500" onClick={() => setPreview(!preview)}>{preview ? 'Hide preview' : 'Show preview'}</button>
        {preview && (
          <div className="card space-y-2 text-sm">
            <RichText text={text} />
            <ol className="list-decimal space-y-1 pl-5">{stepList.map((s, i) => <li key={i}><RichText text={s} /></li>)}</ol>
            <RichText text={`Answer: ${answer}`} className="font-semibold" />
          </div>
        )}
        <div className="flex gap-2 pt-2">
          {problem && (
            <button className="btn-danger" onClick={async () => { if (confirm('Delete this problem?')) { await db.problems.delete(problem.id); onClose() } }}>Delete</button>
          )}
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={!ok} onClick={save}>Save</button>
        </div>
      </div>
    </Modal>
  )
}
