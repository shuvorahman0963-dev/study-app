import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle } from '../components/Layout'
import { db, type SubjectType } from '../db'
import { ExamBadge } from './Home'

export default function Subjects() {
  const subjects = useLiveQuery(() => db.subjects.toArray(), [])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [type, setType] = useState<SubjectType>('theory')
  const [examDate, setExamDate] = useState('')

  const add = async () => {
    if (!name.trim()) return
    await db.subjects.add({ name: name.trim(), code: code.trim(), type, examDate, createdAt: Date.now() } as never)
    setName('')
    setCode('')
    setExamDate('')
  }

  return (
    <div className="space-y-3">
      <PageTitle title="Subjects" />
      {subjects?.map((s) => (
        <Link key={s.id} to={`/subject/${s.id}`} className="card flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold">{s.name}</div>
            <div className="text-xs text-slate-500">{s.code} · {s.type === 'math' ? 'Math' : 'Theory'}</div>
          </div>
          <ExamBadge examDate={s.examDate} />
        </Link>
      ))}

      <div className="card space-y-2">
        <h2 className="font-semibold">+ Add subject</h2>
        <input className="input" placeholder="Subject name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Course code (e.g. WPE 205)" value={code} onChange={(e) => setCode(e.target.value)} />
        <div className="flex gap-2">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as SubjectType)}>
            <option value="theory">Theory</option>
            <option value="math">Math / numerical</option>
          </select>
          <input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </div>
        <button className="btn-primary w-full" onClick={add} disabled={!name.trim()}>Add</button>
      </div>
    </div>
  )
}
