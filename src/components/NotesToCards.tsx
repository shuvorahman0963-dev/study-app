import { useState } from 'react'
import { db } from '../db'
import { parseCards } from '../lib/claude'
import { newFsrsCard } from '../lib/scheduler'
import { Modal } from './CardEditor'
import { toast } from './Toast'

export default function NotesToCards({ text, subjectId, topicId, onClose }: { text: string; subjectId: number; topicId: number; onClose: () => void }) {
  const [cards, setCards] = useState(() => parseCards(text))

  const set = (i: number, field: 'front' | 'back', v: string) => setCards(cards.map((c, j) => (j === i ? { ...c, [field]: v } : c)))
  const valid = cards.filter((c) => c.front.trim() && c.back.trim())

  const save = async () => {
    const now = Date.now()
    await db.cards.bulkAdd(
      valid.map((c) => ({ subjectId, topicId, front: c.front.trim(), back: c.back.trim(), tags: ['claude'], myNotes: '', fsrs: newFsrsCard(), createdAt: now })) as never,
    )
    toast(`✅ ${valid.length} new cards added`)
    onClose()
  }

  return (
    <Modal title="Turn into flashcards" onClose={onClose}>
      {cards.length === 0 ? (
        <div className="space-y-3 text-sm">
          <p>কোনো কার্ড খুঁজে পাওয়া যায়নি। Claude-এর উত্তর এই ফরম্যাটে হতে হবে:</p>
          <pre className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">Q: question{'\n'}A: answer{'\n\n'}Q: ...{'\n'}A: ...</pre>
          <p className="text-slate-500">টিপ: "Make 5 flashcards" অপশন দিয়ে prompt কপি করলে Claude ঠিক এই ফরম্যাটে দেবে।</p>
          <button className="btn-ghost w-full" onClick={() => setCards([{ front: '', back: '' }])}>Add manually</button>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((c, i) => (
            <div key={i} className="card space-y-2 p-3!">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Card {i + 1}</span>
                <button className="text-rose-500" onClick={() => setCards(cards.filter((_, j) => j !== i))}>Remove</button>
              </div>
              <textarea className="input min-h-14 text-sm" value={c.front} onChange={(e) => set(i, 'front', e.target.value)} placeholder="Front" />
              <textarea className="input min-h-14 text-sm" value={c.back} onChange={(e) => set(i, 'back', e.target.value)} placeholder="Back" />
            </div>
          ))}
          <button className="text-sm text-indigo-500" onClick={() => setCards([...cards, { front: '', back: '' }])}>+ Add another</button>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
            <button className="btn-primary flex-1" disabled={!valid.length} onClick={save}>Add {valid.length} cards</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
