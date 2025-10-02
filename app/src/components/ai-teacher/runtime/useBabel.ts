import { useEffect, useState } from 'react'

declare global {
  interface Window { Babel: any }
}

export function useBabelReady(): boolean {
  const [ready, setReady] = useState<boolean>(typeof window !== 'undefined' && !!window.Babel)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.Babel) {
      setReady(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@babel/standalone/babel.min.js'
    script.async = true
    script.onload = () => setReady(true)
    script.onerror = () => setReady(false)
    document.head.appendChild(script)
    return () => { if (script.parentNode) script.parentNode.removeChild(script) }
  }, [])

  return ready
}


