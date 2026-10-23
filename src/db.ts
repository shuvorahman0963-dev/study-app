import Dexie, { type EntityTable } from 'dexie'
import type { Card as FsrsCard } from 'ts-fsrs'

export type SubjectType = 'theory' | 'math'

export interface Subject {
  id: number
  name: string
  code: string
  type: SubjectType
  examDate: string // YYYY-MM-DD, '' if not set
  createdAt: number
}

export interface Chapter {
  id: number
  subjectId: number
  title: string
  order: number
}

export interface Topic {
  id: number
  subjectId: number
  chapterId: number
  title: string
  order: number
  pastPaperFrequency: number
  marks: number
  notes: string
  myNotes: string
}

export interface StudyCard {
  id: number
  subjectId: number
  topicId: number
  front: string
  back: string
  frontImage?: string // data URL
  backImage?: string
  tags: string[]
  myNotes: string
  fsrs: FsrsCard
  createdAt: number
}

export interface ReviewLog {
  id: number
  cardId: number
  subjectId: number
  topicId: number
  rating: number // 1 Again, 2 Hard, 3 Good, 4 Easy
  correct: boolean
  wasNew: boolean
  at: number
}

export interface Problem {
  id: number
  subjectId: number
  topicId: number
  kind: 'worked' | 'practice'
  title: string
  problem: string
  steps: string[]
  answer: string
  image?: string // data URL
  myNotes: string
}

export type ProblemResult = 'solved' | 'partial' | 'failed'

export interface ProblemAttempt {
  id: number
  problemId: number
  subjectId: number
  topicId: number
  result: ProblemResult
  stepsRevealed: number
  mode: 'single' | 'mixed'
  at: number
}

export interface PaperAttempt {
  id: number
  subjectId: number
  year: number
  exam: string
  durationMin: number
  usedMin: number
  scored: number
  total: number
  at: number
}

export interface PastQuestion {
  id: number
  subjectId: number
  topicId: number | null
  year: number
  exam: string
  text: string
  marks: number
}

export type QuizSource = 'quiz' | 'weak' | 'retest'

export interface QuizResult {
  id: number
  cardId: number
  subjectId: number
  topicId: number
  correct: boolean
  mode: 'mcq' | 'short'
  source: QuizSource
  at: number
}

/** explain → quiz → retest → cleared (a failed retest goes back to explain). */
export type WeakStatus = 'explain' | 'quiz' | 'retest' | 'cleared'

export interface WeakTopic {
  id: number
  subjectId: number
  topicId: number
  status: WeakStatus
  missedCardIds: number[]
  explanation: string
  retestAt: number | null
  createdAt: number
  updatedAt: number
}

export interface FocusSession {
  id: number
  subjectId: number
  minutes: number
  at: number
}

export interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('study-app') as Dexie & {
  subjects: EntityTable<Subject, 'id'>
  chapters: EntityTable<Chapter, 'id'>
  topics: EntityTable<Topic, 'id'>
  cards: EntityTable<StudyCard, 'id'>
  reviewLogs: EntityTable<ReviewLog, 'id'>
  problems: EntityTable<Problem, 'id'>
  pastQuestions: EntityTable<PastQuestion, 'id'>
  quizResults: EntityTable<QuizResult, 'id'>
  weakTopics: EntityTable<WeakTopic, 'id'>
  focusSessions: EntityTable<FocusSession, 'id'>
  problemAttempts: EntityTable<ProblemAttempt, 'id'>
  paperAttempts: EntityTable<PaperAttempt, 'id'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  subjects: '++id, name',
  chapters: '++id, subjectId',
  topics: '++id, subjectId, chapterId',
  cards: '++id, subjectId, topicId',
  reviewLogs: '++id, cardId, subjectId, topicId, at',
  problems: '++id, subjectId, topicId',
  pastQuestions: '++id, subjectId, topicId',
  settings: 'key',
})

db.version(2).stores({
  quizResults: '++id, cardId, subjectId, topicId, at',
  weakTopics: '++id, subjectId, topicId, status',
})

db.version(3).stores({
  focusSessions: '++id, subjectId, at',
})

db.version(4).stores({
  problemAttempts: '++id, problemId, subjectId, topicId, at',
  paperAttempts: '++id, subjectId, at',
})

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export function setSetting(key: string, value: unknown) {
  return db.settings.put({ key, value })
}

export async function deleteSubject(subjectId: number) {
  await db.transaction('rw', [db.subjects, db.chapters, db.topics, db.cards, db.reviewLogs, db.problems, db.pastQuestions, db.quizResults, db.weakTopics, db.focusSessions, db.problemAttempts, db.paperAttempts], async () => {
    await db.problemAttempts.where({ subjectId }).delete()
    await db.paperAttempts.where({ subjectId }).delete()
    await db.focusSessions.where({ subjectId }).delete()
    await db.quizResults.where({ subjectId }).delete()
    await db.weakTopics.where({ subjectId }).delete()
    await db.chapters.where({ subjectId }).delete()
    await db.topics.where({ subjectId }).delete()
    await db.cards.where({ subjectId }).delete()
    await db.reviewLogs.where({ subjectId }).delete()
    await db.problems.where({ subjectId }).delete()
    await db.pastQuestions.where({ subjectId }).delete()
    await db.subjects.delete(subjectId)
  })
}
