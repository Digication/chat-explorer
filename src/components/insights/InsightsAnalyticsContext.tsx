import { createContext, useContext, useCallback, useRef, useState } from "react";

interface InsightsAnalyticsContextValue {
  /** Register (or update) a brief text summary for a named section. */
  registerSummary: (section: string, summary: string) => void;
  /** Get all summaries joined as a single string for the AI. */
  getAnalyticsContext: () => string;
}

const InsightsAnalyticsContext = createContext<InsightsAnalyticsContextValue>({
  registerSummary: () => {},
  getAnalyticsContext: () => "",
});

export function InsightsAnalyticsProvider({ children }: { children: React.ReactNode }) {
  const summaries = useRef(new Map<string, string>());
  // Bump to notify consumers when summaries change
  const [, setVersion] = useState(0);

  const registerSummary = useCallback((section: string, summary: string) => {
    const prev = summaries.current.get(section);
    if (prev !== summary) {
      summaries.current.set(section, summary);
      setVersion((v) => v + 1);
    }
  }, []);

  const getAnalyticsContext = useCallback(() => {
    const entries = Array.from(summaries.current.entries());
    if (entries.length === 0) return "";
    return entries.map(([section, summary]) => `- ${section}: ${summary}`).join("\n");
  }, []);

  return (
    <InsightsAnalyticsContext.Provider value={{ registerSummary, getAnalyticsContext }}>
      {children}
    </InsightsAnalyticsContext.Provider>
  );
}

export function useInsightsAnalytics() {
  return useContext(InsightsAnalyticsContext);
}
