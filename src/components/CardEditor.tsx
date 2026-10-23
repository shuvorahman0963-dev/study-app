import { useState } from 'react'
import { db, type StudyCard } from '../db'
import { fileToDataUrl } from '../lib/image'
import { newFsrsCard } from '../lib/scheduler'
import RichText from './RichText'

interface Props {
  subjectId: number
  topicId: number
  card?: StudyCard // undefined = new card
  onClose: () => void
}

function ImagePicker({ label, value, onChange }: { label: string; value?: string; onChange: (v?: string) => void }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <label className="btn-ghost cursor-pointer px-3! py-2!">
        🖼️ {label}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) onChange(await fileToDataUrl(f))
            e.target.value = ''
          }}
        />
      </label>
      {value && (
        <>
          <img src={value} alt="" className="h-12 rounded" />
          <button className="text-rose-500" onClick={() => onChange(undefined)}>
            Remove
          </button>
        </>
      )}
    </div>
  )
}

export default function CardEditor({ subjectId, topicId, card, onClose }: Props) {
  const [front, setFront] = useState(card?.front ?? '')
  const [back, setBack] = useState(card?.back ?? '')
  const [frontImage, setFrontImage] = useState(card?.frontImage)
  const [backImage, setBackImage] = useState(card?.backImage)
  const [tags, setTags] = useState((card?.tags ?? []).join(', '))
  const [preview, setPreview] = useState(false)

  const save = async () => {
    if (!front.trim()) return
    const fields = {
      front: front.trim(),
      back: back.trim(),
      frontImage,
      backImage,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    }
    if (card) await db.cards.update(card.id, fields)
    else await db.cards.add({ ...fields, subjectId, topicId, myNotes: '', fsrs: newFsrsCard(), createdAt: Date.now() } as never)
    onClose()
  }

  return (
    <Modal title={card ? 'Edit card' : 'New card'} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm font-medium">Front (question)</label>
        <textarea className="input min-h-20" value={front} onChange={(e) => setFront(e.target.value)} placeholder="প্রশ্ন / Question" />
        <ImagePicker label="Front image" value={frontImage} onChange={setFrontImage} />
        <label className="block text-sm font-medium">Back (model answer)</label>
        <textarea className="input min-h-32" value={back} onChange={(e) => setBack(e.target.value)} placeholder="English answer. Formula: $p = \rho g h$" />
        <ImagePicker label="Back image" value={backImage} onChange={setBackImage} />
        <label className="block text-sm font-medium">Tags (comma separated)</label>
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
        <p className="text-xs text-slate-500">Formula: inline $x^2$, block $$\frac&#123;a&#125;&#123;b&#125;$$</p>
        <button className="text-sm text-indigo-500" onClick={() => setPreview(!preview)}>
          {preview ? 'Hide preview' : 'Show preview'}
        </button>
        {preview && (
          <div className="card space-y-2">
            <RichText text={front} className="font-semibold" />
            <hr className="border-slate-700" />
            <RichText text={back} />
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" onClick={save} disabled={!front.trim()}>Save</button>
        </div>
      </div>
    </Modal>
  )
}

/** Suggests pieces: blank-line blocks first, else sentences/semicolons. */
export function suggestSplit(back: string): string[] {
  const blocks = back.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
  if (blocks.length > 1) return blocks
  // Protect $...$ formulas so their dots and semicolons are not split.
  const parts = back.match(/(?:\$\$[\s\S]+?\$\$|\$[^$]+\$|[^.;$])+[.;]?/g) ?? [back]
  return parts.map((s) => s.trim().replace(/;$/, '.')).filter((s) => s.length > 1)
}

export function SplitCard({ card, onClose }: { card: StudyCard; onClose: () => void }) {
  const [text, setText] = useState(suggestSplit(card.back).join('\n---\n'))
  const pieces = text.split(/\n-{3,}\n/).map((s) => s.trim()).filter(Boolean)

  const split = async () => {
    if (pieces.length < 2) return
    await db.transaction('rw', db.cards, async () => {
      for (let i = 0; i < pieces.length; i++) {
        await db.cards.add({
          subjectId: card.subjectId,
          topicId: card.topicId,
          front: `${card.front} (${i + 1}/${pieces.length})`,
          back: pieces[i],
          frontImage: card.frontImage,
          backImage: i === 0 ? card.backImage : undefined,
          tags: card.tags,
          myNotes: '',
          fsrs: newFsrsCard(),
          createdAt: Date.now(),
        } as never)
      }
      await db.cards.delete(card.id)
    })
    onClose()
  }

  return (
    <Modal title="Split into small cards" onClose={onClose}>
      <p className="mb-2 text-sm text-slate-500">
        প্রতিটা অংশ <code>---</code> লাইন দিয়ে আলাদা। দরকার মতো এডিট করুন। মোট {pieces.length}টা কার্ড হবে।
      </p>
      <RichText text={card.front} className="mb-2 font-semibold" />
      <textarea className="input min-h-64 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2 pt-3">
        <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
        <button className="btn-primary flex-1" onClick={split} disabled={pieces.length < 2}>
          Split into {pieces.length}
        </button>
      </div>
    </Modal>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost px-3! py-1!" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
