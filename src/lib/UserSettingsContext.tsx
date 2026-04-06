import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

interface UserSettingsCtx {
  /** When true, show full student names. When false, show initials only. */
  showFullNames: boolean;
  setShowFullNames: (v: boolean) => void;
  /** Returns the display-safe version of a student name based on the current setting. */
  getDisplayName: (name: string) => string;
}

const Ctx = createContext<UserSettingsCtx>({
  showFullNames: true,
  setShowFullNames: () => {},
  getDisplayName: (n) => n,
});

export const useUserSettings = () => useContext(Ctx);

/** Convert "Jane Doe" → "J.D." */
function toInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase())
      .filter(Boolean)
      .join(".") + "."
  );
}

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const [showFullNames, setShowFullNames] = useState(() => {
    try {
      const stored = localStorage.getItem("chat-explorer:showFullNames");
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  const handleSetShowFullNames = useCallback((v: boolean) => {
    setShowFullNames(v);
    try {
      localStorage.setItem("chat-explorer:showFullNames", String(v));
    } catch {
      // localStorage unavailable — setting still works for this session
    }
  }, []);

  const getDisplayName = useCallback(
    (name: string) => (showFullNames ? name : toInitials(name)),
    [showFullNames],
  );

  return (
    <Ctx.Provider
      value={{
        showFullNames,
        setShowFullNames: handleSetShowFullNames,
        getDisplayName,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
