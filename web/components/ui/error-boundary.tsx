"use client";

import { Component, type ReactNode } from "react";

/**
 * Minimal error boundary so a failed 3rd-party canvas (e.g. Spline with no
 * WebGL) renders a fallback instead of crashing the whole screen.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // swallow — the fallback is enough
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
