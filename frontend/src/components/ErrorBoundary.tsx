// If a screen fails while drawing, say so in plain words instead of showing a blank page.
import { Component, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="mx-auto mt-16 max-w-xl rounded-panel border border-tape/30 bg-tape-soft p-6">
        <h1 className="font-display text-20 font-semibold text-ink-950">This screen could not be shown</h1>
        <p className="mt-2 text-14 text-text">Something it needs is missing or in a form it did not expect. This usually means the website and the server are running different versions. Restart the server, then reload this page.</p>
        <p className="mt-3 break-words font-mono text-12 text-muted">{this.state.error.message}</p>
        <button className="mt-4 rounded-full border border-ink-500 bg-surface px-4 py-2 text-14 font-medium text-ink-800 hover:bg-ink-50" onClick={() => location.reload()}>Reload</button>
      </div>
    )
  }
}
