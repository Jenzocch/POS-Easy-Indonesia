// Language switcher — three buttons (ID / EN / 中文).
// Ponytail: switching language writes localStorage then reloads the page,
// so t() everywhere picks up the new language with zero React plumbing.
import { getCurrentLanguage, setLanguage, LANGUAGES } from './translations.js'

export default function LanguageSwitcher({ compact = false }) {
  const current = getCurrentLanguage()

  const switchTo = (code) => {
    if (code === current) return
    setLanguage(code)
    window.location.reload()
  }

  return (
    <div style={{ display: 'inline-flex', gap: 4 }}>
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => switchTo(l.code)}
          style={{
            padding: compact ? '4px 8px' : '6px 12px',
            fontSize: compact ? 12 : 13,
            borderRadius: 6,
            cursor: 'pointer',
            border: '1px solid',
            borderColor: l.code === current ? 'var(--gold, #b8895a)' : 'var(--border, #444)',
            background: l.code === current ? 'var(--gold, #b8895a)' : 'transparent',
            color: l.code === current ? '#fff' : 'var(--text-secondary, #999)',
            fontWeight: l.code === current ? 600 : 400,
          }}
        >
          {compact ? l.code.toUpperCase() : l.label}
        </button>
      ))}
    </div>
  )
}
