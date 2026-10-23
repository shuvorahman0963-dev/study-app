import { useEffect, useState } from 'react'

const EVENT = 'app-toast'

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }))
}

export default function Toaster() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let timer: number | undefined
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail)
      clearTimeout(timer)
      timer = window.setTimeout(() => setMsg(null), 3500)
    }
    window.addEventListener(EVENT, on)
    return () => {
      window.removeEventListener(EVENT, on)
      clearTimeout(timer)
    }
  }, [])
  if (!msg) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
      <div className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg ring-1 ring-white/10 dark:bg-slate-100 dark:text-slate-900">
        {msg}
      </div>
    </div>
  )
}
