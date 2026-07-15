// A minimal error boundary. React error boundaries must be class components,
// so this stays a class even in a React 19 codebase. Used to make the opt-in
// GPU graph renderer safe to try: if cosmos.gl can't start (e.g. WebGL is
// unavailable in the host webview) the fallback renders instead of the whole
// view crashing.
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  fallback: ReactNode;
  /** Bump this to reset the boundary after a recoverable change (e.g. the user
   *  switched renderers), so a previously-failed subtree gets another chance. */
  resetKey?: unknown;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, info);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
