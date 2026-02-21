import { motion } from 'framer-motion'

export function Footer() {
    return (
        <motion.footer
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative z-10 px-8 sm:px-12 py-7 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(171, 187, 214, 0.06)' }}
        >
            <p
                className="text-[11px] font-mono tracking-[0.12em]"
                style={{ color: 'var(--text-muted)', opacity: 0.38 }}
            >
                © {new Date().getFullYear()} MetroX
            </p>

            <div className="flex items-center gap-7">
                {[
                    { label: 'Docs', href: '/docs' },
                    { label: 'Status', href: '#' },
                    { label: 'Runbook', href: '#' },
                ].map(({ label, href }) => (
                    <a
                        key={label}
                        href={href}
                        className="text-[11px] font-mono tracking-[0.12em] transition-all duration-200"
                        style={{ color: 'var(--text-muted)', opacity: 0.35 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.72')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.35')}
                    >
                        {label}
                    </a>
                ))}
            </div>
        </motion.footer>
    )
}
