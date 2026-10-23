import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useMemo } from 'react'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// $$block$$, $inline$, \[block\], \(inline\), and markdown images ![alt](src)
const TOKEN = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|!\[[^\]]*\]\([^)\s]+\))/g

export function renderRich(text: string): string {
  return text
    .split(TOKEN)
    .map((part, i) => {
      if (i % 2 === 0) return escapeHtml(part).replace(/\n/g, '<br>')
      if (part.startsWith('![')) {
        const m = part.match(/!\[([^\]]*)\]\(([^)\s]+)\)/)!
        const src = m[2]
        if (!/^(data:image\/|https?:\/\/)/.test(src)) return escapeHtml(part)
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(m[1])}">`
      }
      const display = part.startsWith('$$') || part.startsWith('\\[')
      const tex = display ? part.slice(2, -2) : part.startsWith('$') ? part.slice(1, -1) : part.slice(2, -2)
      return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false })
    })
    .join('')
}

export default function RichText({ text, className = '' }: { text: string; className?: string }) {
  const html = useMemo(() => renderRich(text ?? ''), [text])
  return <div className={`rich leading-relaxed ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
