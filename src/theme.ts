type Theme = 'dark' | 'light'

export function getTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem('theme', t)
  } catch {
    /* ignore */
  }
  applyTheme(t)
}

export function applyTheme(t: Theme = getTheme()) {
  document.documentElement.classList.toggle('dark', t === 'dark')
}
