import { useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { CanvasBackground } from './components/canvas/CanvasBackground'
import { FloatingToolbar } from './components/canvas/FloatingToolbar'
import { CommandPalette } from './components/CommandPalette'
import { useOnboardingContext } from './components/onboarding/OnboardingProvider'
import { SpotlightWalkthrough } from './components/onboarding/SpotlightWalkthrough'
import MonitorPage from './pages/MonitorPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ProvidersPage from './pages/ProvidersPage'
import WizardPage from './pages/WizardPage'

export default function App() {
  const [commandOpen, setCommandOpen] = useState(false)
  const location = useLocation()
  const onboarding = useOnboardingContext()

  useEffect(() => {
    if (!onboarding.completed) {
      const timer = setTimeout(() => onboarding.start(), 800)
      return () => clearTimeout(timer)
    }
  }, [onboarding.completed])

  return (
    <CanvasBackground>
      <FloatingToolbar onCommandPalette={() => setCommandOpen(true)} />
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onReplayTour={() => {
          onboarding.reset()
          onboarding.start()
        }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="h-full w-full"
        >
          <Routes location={location}>
            <Route path="/" element={<MonitorPage />} />
            <Route path="/config" element={<WizardPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<ProvidersPage />} />
          </Routes>
        </motion.div>
      </AnimatePresence>

      <SpotlightWalkthrough />
    </CanvasBackground>
  )
}
