import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { useTrackEvent } from "@/lib/hooks/useTrackEvent";

/**
 * Renderless component that automatically tracks page views
 * whenever the route changes. Mount inside the authenticated
 * route tree so only logged-in users are tracked.
 */
export default function PageViewTracker() {
  const location = useLocation();
  const trackEvent = useTrackEvent();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    // Skip duplicate fires for the same path
    if (location.pathname === prevPath.current) return;

    trackEvent("PAGE_VIEW", "view", {
      path: location.pathname,
      referrer: prevPath.current,
    });

    prevPath.current = location.pathname;
  }, [location.pathname, trackEvent]);

  return null;
}
