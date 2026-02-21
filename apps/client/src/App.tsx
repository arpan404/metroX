import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Hero } from './components/landing/hero'
import { Navbar } from './components/landing/navbar'
import { Sections } from './components/landing/sections'
import { Footer } from './components/landing/footer'
import { DocsPage } from './components/pages/DocsPage'
import { AppPage } from './pages/AppPage'
import { TooltipProvider } from './components/ui/tooltip'

function LandingPage() {
    return (
        <div className="landing-root relative min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <div className="noise-overlay" />
            <Navbar />
            <main>
                <Hero />
                <Sections />
            </main>
            <Footer />
        </div>
    )
}

export default function App() {
    return (
        <TooltipProvider delayDuration={400}>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/docs" element={<DocsPage />} />
                    <Route path="/app" element={<AppPage />} />
                </Routes>
            </BrowserRouter>
        </TooltipProvider>
    )
}
