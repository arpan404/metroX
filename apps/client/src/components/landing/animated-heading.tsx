import { useTypewriter } from '@/hooks/use-typewriter'

const words = [
    'Failure Coverage for LLM Pipelines.',
    'Failure Coverage for LLM & Agentic Pipelines.',
    'Adversarial Evaluation at Scale.',
    'Reliability for AI Systems.',
    'CI for Large Language Models.',
    'Quantified Robustness Testing.',
]

export function AnimatedHeading() {
    const { text } = useTypewriter({
        words,
        typeSpeed: 55,
        deleteSpeed: 30,
        pauseDuration: 2600,
        deletePauseDuration: 400,
    })

    return (
        <div className="text-center w-full">
            {/* Metro logo — ultra-wide, physically clipped */}
            <div className="mb-1 premium-glow animate-float-soft overflow-hidden h-[120px] sm:h-[150px] md:h-[190px] lg:h-[225px] flex items-center justify-center">
                <img
                    src="/metro-logo.png"
                    alt="Metro Logo"
                    className="mx-auto w-[400px] sm:w-[600px] md:w-[800px] lg:w-[980px]  brightness-110 "
                    style={{ display: 'block' }}
                />
            </div>

            {/* Typewriter line — zero gap via clipping */}
            <div
                className="flex items-center justify-center px-2 text-[1.45rem] sm:text-[2rem] md:text-[2.45rem] lg:text-[3rem] font-display font-semibold tracking-tight leading-[1.03] mt-1 sm:mt-3"
                style={{ color: 'var(--text-primary)', textShadow: '0 0 30px rgba(255,255,255,0.1)' }}
            >
                <span className="relative inline-block max-w-full">
                    <span className="inline-block max-w-[92vw] sm:max-w-[80vw] lg:max-w-[78vw] whitespace-normal break-words">{text}</span>
                    <span
                        className="inline-block w-[3px] h-[0.85em] ml-[4px] align-middle animate-cursor-blink"
                        style={{ backgroundColor: 'var(--text-muted)' }}
                        aria-hidden="true"
                    />
                </span>
            </div>
        </div>
    )
}
