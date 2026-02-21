import { NavLink, Route, Routes } from 'react-router-dom'
import MonitorPage from './pages/MonitorPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ProvidersPage from './pages/ProvidersPage'
import WizardPage from './pages/WizardPage'
import { cn } from './lib/utils'
import { Button } from './components/ui/button'

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => cn(isActive ? 'text-foreground' : 'text-muted-foreground')}>
      {({ isActive }) => (
        <Button variant={isActive ? 'default' : 'ghost'} size="sm" className="rounded-full">
          {label}
        </Button>
      )}
    </NavLink>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">AutoRedTeam v1.11</p>
            <h1 className="text-lg font-semibold">Reliability Evaluation Console</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            <NavItem to="/" label="Workbench" />
            <NavItem to="/monitor" label="Monitor" />
            <NavItem to="/analytics" label="Analytics" />
            <NavItem to="/providers" label="Providers" />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <Routes>
          <Route path="/" element={<WizardPage />} />
          <Route path="/monitor" element={<MonitorPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/providers" element={<ProvidersPage />} />
        </Routes>
      </main>
    </div>
  )
}
