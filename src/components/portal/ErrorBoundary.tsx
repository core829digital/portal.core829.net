"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback: (error: unknown, reset: () => void) => ReactNode;
};
type State = { failed: boolean; error: unknown };

/** Intercetta gli errori di caricamento dei dati e mostra un messaggio al posto di una pagina rotta. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, error };
  }

  reset = () => this.setState({ failed: false, error: null });

  render() {
    return this.state.failed ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}
