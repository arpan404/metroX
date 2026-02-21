import { motion, cubicBezier } from 'framer-motion'

const pillars = [
    {
        index: '01',
        title: 'Benchmark Dataset',
        description: 'Versioned adversarial corpus spanning prompt injection, jailbreak, hallucination, and tool misuse — with immutable run lineage.',
        tags: ['Slice tagging', 'Novelty scoring', 'Reproducible'],
    },
    {
        index: '02',
        title: 'Scoring Framework',
        description: 'Deterministic and probabilistic scoring with bootstrap CIs, effect sizes, and corrected p-values driving configurable release gates.',
        tags: ['Weak supervision', 'Hard gate caps', 'CI-ready'],
    },
    {
        index: '03',
        title: 'Robustness Dashboard',
        description: 'Frontend-first command center — run setup, live telemetry, cost intelligence, drift analytics, and report generation.',
        tags: ['Guided wizard', 'SSE + WebSocket', 'Drift'],
    },
]

const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.1 } },
}

const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: cubicBezier(0.22, 1, 0.36, 1) } },
}

export function Sections() {
    return (
        <div className="relative z-10 w-full max-w-5xl mx-auto px-6 sm:px-10 pb-32">

            {/* ── Pillars ─────────────────────────────── */}
            <section>
                <motion.p
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="text-[10px] font-mono tracking-[0.22em] uppercase mb-8"
                    style={{ color: 'var(--text-muted)', opacity: 0.5 }}
                >
                    Core Capabilities
                </motion.p>

                <motion.div
                    variants={stagger}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: '-60px' }}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-px"
                    style={{ border: '1px solid rgba(171,187,214,0.09)', borderRadius: '14px', overflow: 'hidden' }}
                >
                    {pillars.map((p) => (
                        <motion.div
                            key={p.index}
                            variants={fadeUp}
                            className="relative flex flex-col gap-4 p-6 sm:p-7 cursor-default"
                            style={{ background: 'rgba(255,255,255,0.018)', transition: 'background 250ms ease' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.034)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.018)')}
                        >
                            <span className="font-mono text-[10px] tracking-[0.18em]" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>
                                {p.index}
                            </span>
                            <h3 className="font-display font-semibold leading-snug" style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                                {p.title}
                            </h3>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.65, flexGrow: 1 }}>
                                {p.description}
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
                                {p.tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="font-mono text-[9.5px] tracking-[0.12em] px-2 py-0.5 rounded"
                                        style={{
                                            color: 'var(--text-muted)',
                                            opacity: 0.55,
                                            border: '1px solid rgba(171,187,214,0.12)',
                                            background: 'rgba(255,255,255,0.028)',
                                        }}
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </section>

        </div>
    )
}
