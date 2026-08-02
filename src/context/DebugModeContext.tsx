import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface DebugModeContextType {
  debugMode: boolean;
  toggleDebugMode: (enabled: boolean) => void;
}

const DebugModeContext = createContext<DebugModeContextType | undefined>(undefined);

interface DebugModeProviderProps {
  children: ReactNode;
}

export function DebugModeProvider({ children }: DebugModeProviderProps) {
  const [debugMode, setDebugMode] = useState<boolean>(() => {
    const val = localStorage.getItem("dev_debug_mode");
    return val !== null ? val === "true" : false;
  });

  const toggleDebugMode = (enabled: boolean) => {
    setDebugMode(enabled);
    localStorage.setItem("dev_debug_mode", enabled.toString());
  };

  // Listen for storage changes to keep state synced across tabs
  useEffect(() => {
    const handleStorage = () => {
      const val = localStorage.getItem("dev_debug_mode");
      if (val !== null) {
        setDebugMode(val === "true");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <DebugModeContext.Provider value={{ debugMode, toggleDebugMode }}>
      {children}
    </DebugModeContext.Provider>
  );
}

export function useDebugMode() {
  const context = useContext(DebugModeContext);
  if (context === undefined) {
    throw new Error("useDebugMode must be used within a DebugModeProvider");
  }
  return context;
}
