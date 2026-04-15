import { useCallback, useEffect, useRef } from "react";
import { useMutation } from "@apollo/client/react";
import { TRACK_EVENTS } from "@/lib/queries/telemetry";

interface QueuedEvent {
  eventCategory: string;
  eventAction: string;
  metadata: string | null;
  pageUrl: string;
  sessionId: string;
  timestamp: string;
}

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH_SIZE = 20;

// Session ID persists for the browser tab lifetime
function getSessionId(): string {
  let sid = sessionStorage.getItem("telemetry_sid");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("telemetry_sid", sid);
  }
  return sid;
}

// Module-level queue so events survive re-renders
let eventQueue: QueuedEvent[] = [];

/**
 * Returns a stable `trackEvent` function that queues telemetry events
 * and flushes them to the server in batches every 5 seconds.
 *
 * Usage:
 *   const trackEvent = useTrackEvent();
 *   trackEvent("AI_CHAT", "send_message", { model: "claude" });
 */
export function useTrackEvent() {
  const [sendEvents] = useMutation(TRACK_EVENTS);
  const sendEventsRef = useRef(sendEvents);
  sendEventsRef.current = sendEvents;

  // Flush queued events to the server
  const flush = useCallback(() => {
    if (eventQueue.length === 0) return;
    const batch = eventQueue.splice(0, MAX_BATCH_SIZE);
    sendEventsRef.current({
      variables: { events: batch },
    }).catch(() => {
      // Best-effort — don't block the UI if tracking fails
    });
  }, []);

  // Set up the periodic flush timer and beforeunload handler
  useEffect(() => {
    const interval = setInterval(flush, FLUSH_INTERVAL_MS);

    const handleUnload = () => flush();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
      // Flush remaining events on unmount
      flush();
    };
  }, [flush]);

  // The track function that callers use
  const trackEvent = useCallback(
    (
      category: string,
      action: string,
      metadata?: Record<string, unknown>
    ) => {
      eventQueue.push({
        eventCategory: category,
        eventAction: action,
        metadata: metadata ? JSON.stringify(metadata) : null,
        pageUrl: window.location.pathname,
        sessionId: getSessionId(),
        timestamp: new Date().toISOString(),
      });

      // Auto-flush if batch is full
      if (eventQueue.length >= MAX_BATCH_SIZE) {
        flush();
      }
    },
    [flush]
  );

  return trackEvent;
}
