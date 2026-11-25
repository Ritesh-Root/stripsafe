import { Bell, ChevronLeft, Moon, Pill, ScanLine, Store, Sun } from 'lucide-react'
import type { ReactNode } from 'react'

export type Tab = 'home' | 'cabinet' | 'alerts' | 'chemist'

type ShellProps = {
  tab: Tab | null
  title?: string
  onBack?: () => void
  onTab: (tab: Tab) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  children: ReactNode
}

const TABS: { id: Tab; label: string; icon: typeof ScanLine }[] = [
  { id: 'home', label: 'Scan', icon: ScanLine },
  { id: 'cabinet', label: 'Cabinet', icon: Pill },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'chemist', label: 'Chemist', icon: Store },
]

export function Shell({ tab, title, onBack, onTab, theme, onToggleTheme, children }: ShellProps) {
  const themeLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      {title ? (
        <header className="app-bar">
          {onBack ? (
            <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
              <ChevronLeft aria-hidden="true" />
            </button>
          ) : null}
          <h1>{title}</h1>
          <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={themeLabel} aria-pressed={theme === 'dark'}>
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </header>
      ) : null}
      <main id="main" className={title ? 'main tight' : 'main'} tabIndex={-1}>
        {children}
      </main>
      {tab ? (
        <nav className="nav" aria-label="Primary">
          {TABS.map((item) => {
            const Icon = item.icon
            const current = item.id === tab
            return (
              <button key={item.id} type="button" aria-current={current ? 'page' : undefined} onClick={() => onTab(item.id)}>
                <span className="pill"><Icon aria-hidden="true" size={24} /></span>
                {item.label}
              </button>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}

export function ThemeButton({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  const themeLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  return (
    <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={themeLabel} aria-pressed={theme === 'dark'}>
      {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  )
}
