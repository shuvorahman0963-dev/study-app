import { useEffect, useState } from 'react'
import { db } from '../db'
import { buildPrompt, copyText, EXPLAIN_TYPES, loadContext, type ExplainExtra, type ExplainTarget, type ExplainType } from '../lib/claude'
import { Modal } from './CardEditor'
import NotesToCards from './NotesToCards'
import { toast } from './Toast'

const CLAUDE_URL = 'https://claude.ai/new'

/** Appends pasted text to the target's "My notes" field. */
async function saveNote(target: ExplainTarget, text: string, label: string) {
  const stamp = `--- Claude · ${label} · ${new Date().toLocaleDateString()} ---`
  const join = (old: string) => (old?.trim() ? `${old.trim()}\n\n${stamp}\n${text.trim()}` : `${stamp}\n${text.trim()}`)
  if (target.kind === 'card') {
    const c = await db.cards.get(target.id)
    if (c) await db.cards.update(c.id, { myNotes: join(c.myNotes) })
  } else if (target.kind === 'topic') {
    const t = await db.topics.get(target.id)
    if (t) await db.topics.update(t.id, { myNotes: join(t.myNotes) })
  } else {
    const p = await db.problems.get(target.id)
    if (p) await db.problems.update(p.id, { myNotes: join(p.myNotes) })
  }
}

export default function ExplainButton({ target, extra, className = '' }: { target: ExplainTarget; extra?: ExplainExtra; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={`btn-ghost px-3! py-2! text-sm ${className}`} onClick={() => setOpen(true)}>
        🤖 Explain with Claude
      </button>
      {open && <ExplainModal target={target} extra={extra} onClose={() => setOpen(false)} />}
    </>
  )
}

function ExplainModal({ target, extra, onClose }: { target: ExplainTarget; extra?: ExplainExtra; onClose: () => void }) {
  const [prompts, setPrompts] = useState<Partial<Record<ExplainType, string>>>({})
  const [used, setUsed] = useState<ExplainType | null>(null)
  const [pasted, setPasted] = useState('')
  const [ids, setIds] = useState<{ subjectId: number; topicId: number } | null>(null)
  const [toCards, setToCards] = useState(false)

  // Prompts are built up front so the click handler can copy + open synchronously (popup blockers).
  useEffect(() => {
    ;(async () => {
      const out: Partial<Record<ExplainType, string>> = {}
      for (const t of EXPLAIN_TYPES) out[t.id] = await buildPrompt(target, t.id, extra)
      setPrompts(out)
      const ctx = await loadContext(target)
      if (ctx) setIds({ subjectId: ctx.subjectId, topicId: ctx.topicId })
    })()
  }, [target.kind, target.id])

  const send = (type: ExplainType) => {
    const text = prompts[type]
    if (!text) return
    copyText(text).then((ok) => toast(ok ? '📋 Prompt copied — paste it in Claude' : '⚠️ Copy failed — select the prompt and copy manually'))
    window.open(CLAUDE_URL, '_blank', 'noopener')
    setUsed(type)
  }

  const label = EXPLAIN_TYPES.find((t) => t.id === used)?.label ?? 'Explanation'

  return (
    <Modal title="🤖 Explain with Claude" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">কী ধরনের ব্যাখ্যা চান? চাপ দিলে prompt কপি হবে আর Claude খুলবে — সেখানে পেস্ট (Ctrl+V) করুন।</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EXPLAIN_TYPES.map((t) => (
          <button key={t.id} className={`btn-ghost justify-start! text-left ${used === t.id ? 'ring-2 ring-indigo-500' : ''}`} disabled={!prompts[t.id]} onClick={() => send(t.id)}>
            <span className="text-xl">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {used && prompts[used] && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-indigo-500">Show copied prompt</summary>
          <textarea readOnly className="input mt-2 min-h-40 font-mono text-xs" value={prompts[used]} onFocus={(e) => e.target.select()} />
        </details>
      )}

      <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <label className="text-sm font-semibold">Claude-এর উত্তর এখানে পেস্ট করুন</label>
        <textarea className="input min-h-32 text-sm" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste Claude's explanation…" />
        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            disabled={!pasted.trim()}
            onClick={async () => {
              await saveNote(target, pasted, label)
              toast('✅ Saved to My notes')
              setPasted('')
            }}
          >
            Save to My notes
          </button>
          <button className="btn-ghost flex-1" disabled={!pasted.trim() || !ids} onClick={() => setToCards(true)}>
            🃏 Make flashcards
          </button>
        </div>
      </div>

      {toCards && ids && <NotesToCards text={pasted} subjectId={ids.subjectId} topicId={ids.topicId} onClose={() => setToCards(false)} />}
    </Modal>
  )
}
