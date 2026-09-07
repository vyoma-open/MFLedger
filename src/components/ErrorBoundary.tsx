import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetState = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '60vh', padding: 32, textAlign: 'center'
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: 'rgba(224, 82, 96, 0.1)',
            color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16
          }}>
            <AlertTriangle size={28} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460, margin: '0 0 24px', lineHeight: 1.5 }}>
            {this.state.error?.message || 'An unexpected error occurred while loading this view.'}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={this.handleResetState}>
              Try Again
            </button>
            <button className="btn btn-primary btn-sm" onClick={this.handleReload} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={13} /> Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
