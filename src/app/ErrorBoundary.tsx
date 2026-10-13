import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Last line of defense: if something in the app throws while rendering, say so and offer a way
 * back instead of leaving a blank page. The project itself is untouched (it lives in the store
 * and has already been autosaved).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The app hit an error while drawing the page', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="grid h-full place-items-center p-6">
        <div className="max-w-sm space-y-3 rounded-2xl border border-line bg-panel p-5 text-center shadow-xl">
          <p className="text-[15px] font-semibold">Something went wrong</p>
          <p className="text-[13px] leading-relaxed text-muted">
            Your routine is safe: it was saved before this happened. Try carrying on, or reload the page.
          </p>
          <p className="break-words rounded-md bg-panel2 px-2 py-1.5 font-mono text-[11px] text-muted">{error.message}</p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              className="h-8 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-fg"
              onClick={() => this.setState({ error: null })}
            >
              Carry on
            </button>
            <button
              type="button"
              className="h-8 rounded-md bg-raised px-3 text-[13px] font-medium text-ink"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
