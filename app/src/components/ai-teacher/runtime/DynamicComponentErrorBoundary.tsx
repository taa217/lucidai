import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  onBoundaryError: (error: Error) => void
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class DynamicComponentErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    try { console.error('CodeSlideRuntime: Error Boundary caught an error in dynamic component:', error, errorInfo) } catch {}
    this.props.onBoundaryError(error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null
    }
    return this.props.children
  }
}

export default DynamicComponentErrorBoundary


