import { db, setSetting, type StudyCard } from '../db'
import { saveSession } from './session'

const APP = 'study-app'
const BACKUP_VERSION = 1

export interface Backup {
  app: typeof APP
  backupVersion: number
  exportedAt: string
  tables: Record<string, unknown[]>
}

export async function makeBackup(): Promise<Backup> {
  const tables: Record<string, unknown[]> = {}
  for (const t of db.tables) tables[t.name] = await t.toArray()
  return { app: APP, backupVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables }
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')

export async function backupFile(): Promise<File> {
  const json = JSON.stringify(await makeBackup())
  return new File([json], `study-backup-${stamp()}.json`, { type: 'application/json' })
}

/** Saves the backup as a download. */
export async function downloadBackup() {
  const file = await backupFile()
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  await setSetting('lastBackup', Date.now())
}

/** Opens the phone's share sheet (Drive, WhatsApp, email…) where supported. */
export async function shareBackup() {
  const file = await backupFile()
  if (!navigator.canShare?.({ files: [file] })) return false
  await navigator.share({ files: [file], title: 'Study app backup' })
  await setSetting('lastBackup', Date.now())
  return true
}

/** FSRS dates come back from JSON as strings. */
function reviveCard(c: StudyCard): StudyCard {
  const f = c.fsrs as unknown as Record<string, unknown>
  return {
    ...c,
    fsrs: {
      ...c.fsrs,
      due: new Date(f.due as string),
      last_review: f.last_review ? new Date(f.last_review as string) : undefined,
    },
  }
}

export function parseBackup(text: string): Backup {
  let data: Backup
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('ফাইলটা JSON নয়।')
  }
  if (data?.app !== APP || !data.tables) {
    throw new Error('এটা এই অ্যাপের backup ফাইল নয়। (Claude-এর JSON হলে উপরের "Import from Claude" ব্যবহার করুন।)')
  }
  return data
}

/** Replaces ALL data on this device with the backup. */
export async function restoreBackup(data: Backup) {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      await t.clear()
      let rows = data.tables[t.name] ?? []
      if (t.name === 'cards') rows = (rows as StudyCard[]).map(reviveCard)
      if (rows.length) await t.bulkPut(rows)
    }
  })
  saveSession(null)
}

export function backupSummary(data: Backup) {
  const n = (k: string) => data.tables[k]?.length ?? 0
  return `${n('subjects')} subjects · ${n('cards')} cards · ${n('reviewLogs')} reviews · exported ${new Date(data.exportedAt).toLocaleString()}`
}
