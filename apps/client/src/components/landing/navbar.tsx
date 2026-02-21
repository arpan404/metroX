import { motion } from 'framer-motion'
import { LiquidGlassButton } from '@/components/landing/liquid-glass-button'

export function Navbar() {
    return (
        <motion.header
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }}
            className="fixed top-0 left-0 right-0 z-50 px-8 sm:px-12 py-5 flex items-center justify-between pointer-events-none"
        >
            <a href="/" className="pointer-events-auto flex items-center gap-2.5" aria-label="MetroX">
                <img
                    src="/favicon.svg"
                    alt="MetroX"
                    className="opacity-80 hover:opacity-100 transition-opacity duration-300"
                    style={{ height: '36px', width: '36px', objectFit: 'contain' }}
                />
                <span
                    className="font-display font-semibold tracking-tight select-none"
                    style={{
                        fontSize: '14px',
                        color: 'var(--text-primary)',
                        opacity: 0.75,
                        letterSpacing: '0.03em',
                    }}
                >
                    MetroX
                </span>
            </a>

            <div className="pointer-events-auto flex items-center gap-5">
                <LiquidGlassButton href="/app">
                    Go to App →
                </LiquidGlassButton>
            </div>
        </motion.header>
    )
}
