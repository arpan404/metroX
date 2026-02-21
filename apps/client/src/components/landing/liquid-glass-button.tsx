import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface LiquidGlassButtonProps {
    children: ReactNode
    href?: string
    onClick?: () => void
    className?: string
}

export function LiquidGlassButton({ children, href, onClick, className = '' }: LiquidGlassButtonProps) {
    const baseClass = `liquid-glass-btn rounded-[10px] px-5 py-2 text-[11px] font-mono tracking-[0.16em] uppercase ${className}`
    const style = { color: 'var(--text-primary)', fontWeight: 500 }

    if (href) {
        return (
            <motion.a
                href={href}
                className={baseClass}
                style={style}
                whileTap={{ scale: 0.97 }}
            >
                {children}
            </motion.a>
        )
    }

    return (
        <motion.button
            onClick={onClick}
            className={baseClass}
            style={style}
            whileTap={{ scale: 0.97 }}
        >
            {children}
        </motion.button>
    )
}
