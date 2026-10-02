import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ErrorState, ButtonButton as Button } from "./DashboardPrimitives";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <ErrorState title="This view could not load" body="Your workspace is still available. Reload this view or choose another page."
      action={<Button onClick={() => window.location.reload()}>Reload view</Button>} />;
  }
}

/** Keep navigation usable if a route chunk or its rendering fails. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <Boundary key={location.pathname}>{children}</Boundary>;
}
