import { useEffect, useRef, useCallback, useState } from 'react'

interface Particle {
    x: number
    y: number
    size: number
    opacity: number
    speedY: number
    speedX: number
    phase: number
    phaseSpeed: number
    depth: number
}

export function ParticlesBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const particlesRef = useRef<Particle[]>([])
    const mouseRef = useRef({ x: 0, y: 0 })
    const animFrameRef = useRef<number>(0)
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        setPrefersReducedMotion(mq.matches)
        const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    const initParticles = useCallback((width: number, height: number) => {
        const count = Math.min(70, Math.floor((width * height) / 16000))
        const particles: Particle[] = []

        for (let i = 0; i < count; i++) {
            const depth = Math.random()
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                size: 0.6 + depth * 1.6,
                opacity: 0.05 + depth * 0.13,
                speedY: -(0.05 + Math.random() * 0.15),
                speedX: (Math.random() - 0.5) * 0.08,
                phase: Math.random() * Math.PI * 2,
                phaseSpeed: 0.002 + Math.random() * 0.005,
                depth,
            })
        }

        particlesRef.current = particles
    }, [])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const resize = () => {
            const dpr = window.devicePixelRatio || 1
            canvas.width = window.innerWidth * dpr
            canvas.height = window.innerHeight * dpr
            canvas.style.width = `${window.innerWidth}px`
            canvas.style.height = `${window.innerHeight}px`
            ctx.scale(dpr, dpr)
            initParticles(window.innerWidth, window.innerHeight)
        }

        resize()
        window.addEventListener('resize', resize)

        const handleMouse = (e: MouseEvent) => {
            mouseRef.current = { x: e.clientX, y: e.clientY }
        }
        window.addEventListener('mousemove', handleMouse)

        const animate = () => {
            const w = window.innerWidth
            const h = window.innerHeight

            ctx.clearRect(0, 0, w, h)

            // Read current theme to pick particle color
            const isLight = document.documentElement.getAttribute('data-theme') === 'light'
            const particleColor = isLight ? '60, 64, 74' : '148, 168, 210'

            particlesRef.current.forEach((p) => {
                let drawX = p.x
                let drawY = p.y

                if (!prefersReducedMotion) {
                    p.phase += p.phaseSpeed
                    p.y += p.speedY
                    p.x += p.speedX + Math.sin(p.phase) * 0.15

                    if (p.y < -10) {
                        p.y = h + 10
                        p.x = Math.random() * w
                    }
                    if (p.x < -10) p.x = w + 10
                    if (p.x > w + 10) p.x = -10

                    const mx = mouseRef.current.x
                    const my = mouseRef.current.y
                    const parallaxStrength = p.depth * 8
                    const dx = (mx - w / 2) / w
                    const dy = (my - h / 2) / h
                    drawX = p.x + dx * parallaxStrength
                    drawY = p.y + dy * parallaxStrength
                }

                ctx.beginPath()
                ctx.arc(drawX, drawY, p.size, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(${particleColor}, ${p.opacity})`
                ctx.fill()
            })

            animFrameRef.current = requestAnimationFrame(animate)
        }

        animate()

        return () => {
            cancelAnimationFrame(animFrameRef.current)
            window.removeEventListener('resize', resize)
            window.removeEventListener('mousemove', handleMouse)
        }
    }, [initParticles, prefersReducedMotion])

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 z-0"
            style={{ background: 'var(--bg-primary)' }}
            aria-hidden="true"
        />
    )
}
