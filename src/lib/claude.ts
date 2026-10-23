import { db, getSetting } from '../db'

export const DEFAULT_INSTRUCTIONS =
  "Explain this in simple Bangla (Bengali script) with a real-life example. If it's math or a derivation, show the full step-by-step calculation with minimal words. Keep the English technical terms. Finally give me 3 short questions to check my understanding."

export const EXPLAIN_TYPES = [
  { id: 'simple', label: 'Simple explanation', icon: '💡', task: 'Give me a simple, clear explanation of this.' },
  { id: 'math', label: 'Step-by-step math', icon: '🧮', task: 'Show the full step-by-step calculation / derivation, one step per line, with minimal words.' },
  { id: 'example', label: 'Real-life example', icon: '🌏', task: 'Explain this mainly through a real-life example (Bangladesh / textile industry context if possible).' },
  { id: 'mindmap', label: 'Make a mind map', icon: '🗺️', task: 'Make a text mind map of this (indented tree with short keywords), then a 3-line summary.' },
  {
    id: 'cards',
    label: 'Make 5 flashcards',
    icon: '🃏',
    task: 'Make 5 short flashcards on this. Output each card exactly as:\nQ: <question>\nA: <short English answer>\nwith a blank line between cards. Use $...$ for formulas. No other text.',
  },
] as const

export type ExplainType = (typeof EXPLAIN_TYPES)[number]['id']

export type ExplainTarget = { kind: 'card' | 'topic' | 'problem'; id: number }

export interface ExplainExtra {
  myAnswer?: string
  heading?: string
  lines?: string[] // e.g. missed questions for a weak topic
}

/** Collects subject/chapter/topic + question/answer for the target. */
export async function loadContext(target: ExplainTarget) {
  let topicId = 0
  const parts: string[] = []
  if (target.kind === 'card') {
    const c = await db.cards.get(target.id)
    if (!c) return null
    topicId = c.topicId
    parts.push(`Question: ${c.front}`, `Model answer: ${c.back}`)
  } else if (target.kind === 'problem') {
    const p = await db.problems.get(target.id)
    if (!p) return null
    topicId = p.topicId
    parts.push(`Problem: ${p.problem}`, `Solution steps:\n${p.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`, `Final answer: ${p.answer}`)
  } else {
    topicId = target.id
    const t = await db.topics.get(topicId)
    if (t?.notes) parts.push(`Topic notes: ${t.notes}`)
  }
  const topic = await db.topics.get(topicId)
  const chapter = topic ? await db.chapters.get(topic.chapterId) : undefined
  const subject = topic ? await db.subjects.get(topic.subjectId) : undefined
  const header = [
    `Subject: ${subject?.name ?? ''}${subject?.code ? ` (${subject.code})` : ''}`,
    `Chapter: ${chapter?.title ?? ''}`,
    `Topic: ${topic?.title ?? ''}`,
  ]
  return { header, parts, topicId, subjectId: topic?.subjectId ?? 0 }
}

export async function buildPrompt(target: ExplainTarget, type: ExplainType, extra: ExplainExtra = {}) {
  const ctx = await loadContext(target)
  if (!ctx) return ''
  const instructions = await getSetting('claudeInstructions', DEFAULT_INSTRUCTIONS)
  const t = EXPLAIN_TYPES.find((x) => x.id === type)!
  const lines = [
    "I'm a university engineering student preparing for my exam.",
    '',
    ...ctx.header,
    ...ctx.parts,
  ]
  if (extra.heading && extra.lines?.length) lines.push('', `${extra.heading}:`, ...extra.lines.map((l) => `- ${l}`))
  if (extra.myAnswer?.trim()) lines.push(`My answer: ${extra.myAnswer.trim()}`)
  lines.push('', `Task: ${t.task}`, '', `My instructions: ${instructions}`)
  return lines.join('\n')
}

/** Copies text; falls back to a hidden textarea when the async clipboard API is blocked. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/** Parses "Q: ... / A: ..." blocks (or "front | back" lines) into cards. */
export function parseCards(text: string): { front: string; back: string }[] {
  const clean = text.replace(/\*\*/g, '').replace(/\r/g, '')
  const out: { front: string; back: string }[] = []
  const qa = /(?:^|\n)\s*(?:\d+[.)]\s*)?(?:Q|Question|Front|প্রশ্ন)\s*[:：]\s*([\s\S]*?)\n\s*(?:A|Answer|Back|উত্তর)\s*[:：]\s*([\s\S]*?)(?=\n\s*(?:\d+[.)]\s*)?(?:Q|Question|Front|প্রশ্ন)\s*[:：]|$)/gi
  for (const m of clean.matchAll(qa)) {
    const front = m[1].trim()
    const back = m[2].trim()
    if (front && back) out.push({ front, back })
  }
  if (out.length) return out
  for (const line of clean.split('\n')) {
    const [front, ...rest] = line.split(/\s(?:\||::)\s/)
    if (rest.length && front.trim()) out.push({ front: front.replace(/^\s*[-*\d.)]+\s*/, '').trim(), back: rest.join(' | ').trim() })
  }
  return out
}
