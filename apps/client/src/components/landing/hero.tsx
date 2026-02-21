import { motion } from 'framer-motion'
import { useTypewriter } from '@/hooks/use-typewriter'

const words = [
    'Reliability for AI Systems.',
    'CI for Large Language Models.',
    'Adversarial Evaluation at Scale.',
    'Quantified Robustness Testing.',
    'Unit Tests for AI Behavior.',
]

export function Hero() {
    const { text } = useTypewriter({
        words,
        typeSpeed: 52,
        deleteSpeed: 28,
        pauseDuration: 2800,
        deletePauseDuration: 380,
    })

    return (
        <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
            {/* Premium radial spotlight — deep behind logo */}
            <div
                className="absolute left-1/2 pointer-events-none"
                style={{
                    top: '50%',
                    transform: 'translate(-50%, -54%)',
                    width: '900px',
                    height: '700px',
                    background: 'radial-gradient(ellipse at center, rgba(130,155,220,0.09) 0%, rgba(100,130,200,0.04) 40%, transparent 72%)',
                }}
                aria-hidden="true"
            />
            {/* Tighter secondary glow at center */}
            <div
                className="absolute left-1/2 pointer-events-none"
                style={{
                    top: '46%',
                    transform: 'translate(-50%, -50%)',
                    width: '450px',
                    height: '350px',
                    background: 'radial-gradient(ellipse at center, rgba(160,185,240,0.06) 0%, transparent 68%)',
                }}
                aria-hidden="true"
            />

            <div className="relative flex flex-col items-center text-center max-w-3xl mx-auto">

                {/* Logo */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'flex-start',
                        marginBottom: '-4px',
                        
                    }}
                >
                    <img
                        src="/metro-logo.png"
                        alt="MetroX"
                        className="mx-auto"
                        style={{
                            width: 'clamp(330px, 57vw, 720px)',
                            maxWidth: 'none',
                        }}
                    />
                </motion.div>

                {/* Typewriter heading — flush under logo */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.55, ease: 'easeOut' }}
                    className="font-display font-semibold tracking-tight"
                    style={{
                        fontSize: 'clamp(1.55rem, 3.2vw, 2.3rem)',
                        color: 'var(--text-primary)',
                        lineHeight: 1.2,
                        minHeight: '1.3em',
                    }}
                >
                    <span>{text}</span>
                    <span
                        className="inline-block w-[2px] h-[0.8em] ml-[3px] align-middle animate-cursor-blink"
                        style={{ backgroundColor: 'var(--accent-graphite)' }}
                        aria-hidden="true"
                    />
                </motion.div>

                {/* Description */}
                <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.85, ease: 'easeOut' }}
                    className="mt-5 max-w-md"
                    style={{
                        fontSize: '15px',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.75,
                        letterSpacing: '0.01em',
                        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                        fontWeight: 400,
                        opacity: 0.78,
                    }}
                >
                    Reproducible adversarial evaluations, confidence-aware scoring,
                    and release gates for LLM and agentic systems.
                </motion.p>
            </div>

            {/* Scroll indicator */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 1.2 }}
                className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
                aria-hidden="true"
            >
                <motion.div
                    animate={{ y: [0, 5, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                    <svg width="14" height="18" viewBox="0 0 14 18" fill="none">
                        <path d="M7 0v14M1 9l6 6 6-6" stroke="rgba(171,187,214,0.18)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </motion.div>
            </motion.div>
        </section>
    )
}
