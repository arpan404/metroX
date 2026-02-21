import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './components/theme-provider'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from './components/ui/sonner'
import './index.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
