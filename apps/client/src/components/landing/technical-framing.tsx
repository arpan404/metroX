import { motion } from 'framer-motion'
import { apiSurface, architectureLayers, reliabilityPrinciples } from '@/components/content/landing-content'

export function TechnicalFraming() {
    return (
        <section id="architecture" className="relative z-10 px-6 py-12 sm:py-20 max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    className="liquid-glass rounded-2xl p-8 sm:p-10 lg:col-span-3"
                >
                    <p className="text-xs sm:text-sm font-mono tracking-[0.2em] uppercase mb-4" style={{ color: 'var(--text-muted)' }}>
                        Architecture
                    </p>
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-semibold tracking-tight mb-8" style={{ color: 'var(--text-primary)' }}>
                        Reproducible by Design,
                        <span className="block">Operational at Scale</span>
                    </h2>

                    <div className="space-y-4">
                        {architectureLayers.map((layer, index) => (
                            <div key={layer.name} className="rounded-xl border border-border-soft bg-white/[0.02] p-4 sm:p-5">
                                <p className="text-[11px] uppercase tracking-[0.16em] font-mono mb-2" style={{ color: 'var(--text-muted)' }}>
                                    Layer 0{index + 1}
                                </p>
                                <h3 className="text-base sm:text-lg font-display font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                    {layer.name}
                                </h3>
                                <p className="text-sm sm:text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                    {layer.detail}
                                </p>
                            </div>
                        ))}
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.45, delay: 0.08, ease: 'easeOut' }}
                    className="liquid-glass rounded-2xl p-8 sm:p-10 lg:col-span-2"
                >
                    <p className="text-xs sm:text-sm font-mono tracking-[0.2em] uppercase mb-4" style={{ color: 'var(--text-muted)' }}>
                        Reliability Model
                    </p>
                    <ul className="space-y-4">
                        {reliabilityPrinciples.map((principle) => (
                            <li key={principle} className="text-sm sm:text-[15px] leading-relaxed flex items-start gap-3" style={{ color: 'var(--text-secondary)' }}>
                                <span className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--accent-platinum)' }} />
                                {principle}
                            </li>
                        ))}
                    </ul>

                    <div id="api-surface" className="mt-9 pt-7" style={{ borderTop: '1px solid var(--border-soft)' }}>
                        <p className="text-xs sm:text-sm font-mono tracking-[0.2em] uppercase mb-4" style={{ color: 'var(--text-muted)' }}>
                            API Surface
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {apiSurface.map((endpoint) => (
                                <span
                                    key={endpoint}
                                    className="rounded-full border border-border-soft bg-white/[0.03] px-3 py-1.5 text-[12px] sm:text-[13px]"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {endpoint}
                                </span>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    )
}
