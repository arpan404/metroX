import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './components/theme-provider'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from './components/ui/sonner'
import { OnboardingProvider } from './components/onboarding/OnboardingProvider'
import './index.css'
import './styles.css'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <OnboardingProvider>
          <App />
        </OnboardingProvider>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
