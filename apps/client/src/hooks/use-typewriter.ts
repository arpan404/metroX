import { useState, useEffect, useCallback, useRef } from 'react'

interface UseTypewriterOptions {
    words: string[]
    typeSpeed?: number
    deleteSpeed?: number
    pauseDuration?: number
    deletePauseDuration?: number
}

interface UseTypewriterReturn {
    text: string
    isDeleting: boolean
    wordIndex: number
}

export function useTypewriter({
    words,
    typeSpeed = 80,
    deleteSpeed = 50,
    pauseDuration = 2000,
    deletePauseDuration = 500,
}: UseTypewriterOptions): UseTypewriterReturn {
    const [text, setText] = useState('')
    const [isDeleting, setIsDeleting] = useState(false)
    const [wordIndex, setWordIndex] = useState(0)
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

    const currentWord = words[wordIndex]

    const tick = useCallback(() => {
        if (isDeleting) {
            setText((prev) => prev.slice(0, -1))
        } else {
            setText((prev) => currentWord.slice(0, prev.length + 1))
        }
    }, [isDeleting, currentWord])

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        if (mq.matches) {
            setText(currentWord)
            return
        }

        let delay: number

        if (!isDeleting && text === currentWord) {
            // Finished typing — pause then start deleting
            delay = pauseDuration
            timeoutRef.current = setTimeout(() => {
                setIsDeleting(true)
            }, delay)
        } else if (isDeleting && text === '') {
            // Finished deleting — move to next word
            setIsDeleting(false)
            setWordIndex((prev) => (prev + 1) % words.length)
            delay = deletePauseDuration
            timeoutRef.current = setTimeout(tick, delay)
        } else {
            // Typing or deleting in progress
            // Add slight randomness for realistic feel
            const baseSpeed = isDeleting ? deleteSpeed : typeSpeed
            const variance = baseSpeed * 0.4
            delay = baseSpeed + (Math.random() - 0.5) * variance

            timeoutRef.current = setTimeout(tick, delay)
        }

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
        }
    }, [text, isDeleting, currentWord, tick, typeSpeed, deleteSpeed, pauseDuration, deletePauseDuration, words.length])

    return { text, isDeleting, wordIndex }
}
