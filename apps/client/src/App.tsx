import { NavLink, Route, Routes } from 'react-router-dom'
import WizardPage from './pages/WizardPage'
import MonitorPage from './pages/MonitorPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ProvidersPage from './pages/ProvidersPage'

export default function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AutoRedTeam DS+</p>
          <h1>LLM & Agent Reliability Science Console</h1>
        </div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
            Setup Wizard
          </NavLink>
          <NavLink to="/monitor" className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
            Live Monitor
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
            Analytics
          </NavLink>
          <NavLink to="/providers" className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
            Providers
          </NavLink>
        </nav>
      </header>

      <main className="content">
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
