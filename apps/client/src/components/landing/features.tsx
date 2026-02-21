import { motion, easeInOut } from 'framer-motion'
import { Database, BarChart3, LayoutDashboard } from 'lucide-react'
import { productPillars } from '@/components/content/landing-content'

const pillarIcons = [Database, BarChart3, LayoutDashboard]

const containerVariants = {
    hidden: {},
    visible: {
        transition: {
            staggerChildren: 0.12,
        },
    },
}

const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.5,
            ease: easeInOut,
        },
    },
}

export function Features() {
    return (
        <section id="capabilities" className="relative z-10 px-6 py-28 sm:py-36 max-w-6xl mx-auto">
            {/* Section heading */}
            <motion.div
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, ease: 'easeOut' as any }}
                className="text-center mb-16"
            >
                <p
                    className="text-xs sm:text-sm font-mono tracking-[0.2em] uppercase mb-4"
                    style={{ color: 'var(--text-muted)' }}
                >
                    Product Pillars
                </p>
                <h2
                    className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.2rem] font-display font-semibold tracking-tight"
                    style={{ color: 'var(--text-primary)' }}
                >
                    Reliability Infrastructure,
                    <span className="block">Not Prompt Demos</span>
                </h2>
            </motion.div>

            {/* Feature cards */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-60px' }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
                {productPillars.map((pillar, index) => {
                    const Icon = pillarIcons[index] ?? Database
                    return (
                        <motion.div
                            key={pillar.title}
                            variants={cardVariants}
                            whileHover={{ y: -4 }}
                            className="liquid-glass group rounded-2xl p-8 sm:p-9 cursor-default transition-shadow duration-300"
                        >
                            <div
                                className="w-11 h-11 rounded-xl flex items-center justify-center mb-6"
                                style={{ backgroundColor: 'var(--bg-elevated)' }}
                            >
                                <Icon
                                    className="w-5 h-5"
                                    style={{ color: 'var(--text-secondary)' }}
                                />
                            </div>

                            <h3
                                className="text-lg sm:text-xl font-display font-semibold mb-5"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                {pillar.title}
                            </h3>

                            <p
                                className="text-sm sm:text-[15px] leading-relaxed mb-5"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                {pillar.summary}
                            </p>

                            <ul className="space-y-3">
                                {pillar.bullets.map((point) => (
                                    <li
                                        key={point}
                                        className="text-sm sm:text-[15px] font-display leading-relaxed flex items-start gap-3"
                                        style={{ color: 'var(--text-muted)' }}
                                    >
                                        <span
                                            className="mt-2 w-1 h-1 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: 'var(--text-muted)' }}
                                        />
                                        {point}
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    )
                })}
            </motion.div>
        </section>
    )
}
