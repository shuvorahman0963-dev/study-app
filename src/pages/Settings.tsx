import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { PageTitle } from '../components/Layout'
import { db, getSetting, setSetting } from '../db'
import { backupSummary, downloadBackup, parseBackup, restoreBackup, shareBackup } from '../lib/backup'
import { DEFAULT_INSTRUCTIONS } from '../lib/claude'
import { promptInstall, useCanInstall } from '../lib/install'
import { importExport, importText, type ImportResult } from '../lib/importer'
import { sampleData } from '../lib/sample'
import { saveSession } from '../lib/session'
import { getTheme, setTheme } from '../theme'

export default function Settings() {
  const newPerDay = useLiveQuery(() => getSetting('newPerDay', 30), [])
  const bedtime = useLiveQuery(() => getSetting('bedtime', '23:30'), [])
  const instructions = useLiveQuery(() => getSetting('claudeInstructions', DEFAULT_INSTRUCTIONS), [])
  const [log, setLog] = useState<string[]>([])
  const [paste, setPaste] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const lastBackup = useLiveQuery(() => getSetting<number | null>('lastBackup', null), [])
  const canInstall = useCanInstall()
  const [dark, setDark] = useState(getTheme() === 'dark')

  const report = (results: ImportResult[], source: string) =>
    results.map((r) => `✅ ${source}: ${r.subject} — +${r.chapters} chapters, +${r.topics} topics, +${r.cards} cards, +${r.problems} problems, +${r.pastQuestions} past questions`)

  const importFiles = async (files: FileList) => {
    const lines: string[] = []
    // Sort so part 1 is imported before part 2, etc.
    for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      try {
        lines.push(...report(await importText(await f.text()), f.name))
      } catch (e) {
        lines.push(`❌ ${f.name}: ${(e as Error).message}`)
      }
    }
    setLog(lines)
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Settings" />

      <section className="card space-y-3">
        <h2 className="font-semibold">📥 Import from Claude (JSON)</h2>
        <p className="text-sm text-slate-500">
          <code>study-data</code> ফোল্ডারের JSON ফাইলগুলো বেছে নিন (একসাথে অনেকগুলো দেওয়া যাবে)। একই ফাইল দুইবার দিলেও কার্ড ডুপ্লিকেট হবে না।
        </p>
        <label className="btn-primary w-full cursor-pointer">
          Choose JSON files
          <input type="file" accept=".json,application/json" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) importFiles(e.target.files); e.target.value = '' }} />
        </label>
        <details>
          <summary className="cursor-pointer text-sm text-indigo-500">অথবা JSON পেস্ট করুন</summary>
          <textarea className="input mt-2 min-h-32 font-mono text-xs" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='{ "version": 1, "subject": { ... } }' />
          <button className="btn-ghost mt-2 w-full" disabled={!paste.trim()}
            onClick={async () => {
              try { setLog(report(await importText(paste), 'Pasted')); setPaste('') } catch (e) { setLog([`❌ ${(e as Error).message}`]) }
            }}>
            Import pasted JSON
          </button>
        </details>
        <button className="btn-ghost w-full"
          onClick={async () => { const r: ImportResult[] = []; for (const s of sampleData()) r.push(await importExport(s)); setLog(report(r, 'Sample')) }}>
          Load sample data (1 theory + 1 math)
        </button>
        {log.length > 0 && <div className="space-y-1 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">{log.map((l, i) => <p key={i}>{l}</p>)}</div>}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">💾 Backup & move data</h2>
        <p className="text-sm text-slate-500">
          সব ডাটা শুধু এই ডিভাইসে থাকে। ফোন ↔ কম্পিউটারে নিতে: এখানে Export করুন → ফাইলটা অন্য ডিভাইসে পাঠান (Drive/WhatsApp/USB) → সেখানে Restore করুন।
        </p>
        <p className="text-xs text-slate-500">Last backup: {lastBackup ? new Date(lastBackup).toLocaleString() : 'never'}</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={() => downloadBackup().then(() => setLog(['✅ Backup downloaded']))}>⬇️ Export</button>
          <button className="btn-ghost"
            onClick={async () => {
              try {
                if (!(await shareBackup())) setLog(['এই ব্রাউজারে share সাপোর্ট নেই — Export ব্যবহার করুন।'])
              } catch (e) {
                if ((e as Error).name !== 'AbortError') setLog([`❌ ${(e as Error).message}`])
              }
            }}>
            📤 Share
          </button>
        </div>
        <label className="btn-ghost w-full cursor-pointer">
          ♻️ Restore from backup
          <input type="file" accept=".json,application/json" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                const data = parseBackup(await f.text())
                if (!confirm(`এই ডিভাইসের সব ডাটা মুছে backup দিয়ে বদলানো হবে:\n\n${backupSummary(data)}\n\nচালিয়ে যাবেন?`)) return
                await restoreBackup(data)
                setLog([`✅ Restored: ${backupSummary(data)}`])
              } catch (err) {
                setLog([`❌ ${(err as Error).message}`])
              }
            }} />
        </label>
      </section>

      {canInstall && (
        <button className="btn-primary w-full" onClick={promptInstall}>📲 Install app on this device</button>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">📅 Study</h2>
        <label className="flex items-center justify-between gap-3 text-sm">
          New cards per day (all subjects)
          <input className="input w-24!" type="number" min={0} value={newPerDay ?? 30} onChange={(e) => setSetting('newPerDay', Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          Bedtime
          <input className="input w-32!" type="time" value={bedtime ?? '23:30'} onChange={(e) => setSetting('bedtime', e.target.value)} />
        </label>
        <p className="text-xs text-slate-500">Today's plan কখনো bedtime পার হবে না; ৩০ মিনিট আগে reminder দেখাবে।</p>
        {'Notification' in window && Notification.permission !== 'granted' && (
          <button className="btn-ghost w-full text-sm" onClick={() => Notification.requestPermission().then(() => setLog([`Notifications: ${Notification.permission}`]))}>
            🔔 Enable notifications (timer + bedtime)
          </button>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">🤖 "Explain with Claude" instructions</h2>
        <p className="text-sm text-slate-500">প্রতিটা prompt-এর শেষে এই নির্দেশনা যোগ হবে।</p>
        <textarea className="input min-h-28 text-sm" value={draft ?? instructions ?? ''} onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== null && setSetting('claudeInstructions', draft)} />
        <button className="text-sm text-indigo-500" onClick={() => { setDraft(null); setSetting('claudeInstructions', DEFAULT_INSTRUCTIONS) }}>Reset to default</button>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">🎨 Appearance</h2>
        <label className="flex items-center justify-between text-sm">
          Dark mode
          <input type="checkbox" className="h-5 w-5" checked={dark} onChange={(e) => { setDark(e.target.checked); setTheme(e.target.checked ? 'dark' : 'light') }} />
        </label>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-rose-500">⚠️ Danger zone</h2>
        <button className="btn-danger w-full"
          onClick={async () => {
            if (!confirm('সব সাবজেক্ট, কার্ড আর রিভিউ হিস্টরি মুছে যাবে। নিশ্চিত?')) return
            await Promise.all(db.tables.filter((t) => t.name !== 'settings').map((t) => t.clear()))
            saveSession(null)
            setLog(['🗑️ All study data deleted'])
          }}>
          Delete all study data
        </button>
      </section>
    </div>
  )
}
