import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          maxWidth: 600,
          margin: '40px auto',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
        }}>
          <h1 style={{ color: '#b91c1c', marginTop: 0 }}>Something went wrong</h1>
          <p style={{ color: '#991b1b' }}>{this.state.error.message}</p>
          <pre style={{
            background: '#fff',
            padding: 12,
            overflow: 'auto',
            fontSize: 12,
            border: '1px solid #fecaca',
            borderRadius: 4,
          }}>
            {this.state.error.stack}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              background: '#b91c1c',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
