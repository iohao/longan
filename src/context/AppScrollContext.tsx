import { createContext, useContext, type ReactNode, type RefObject } from "react";

type AppScrollRef = RefObject<HTMLElement | null>;

const AppScrollContext = createContext<AppScrollRef | null>(null);

interface AppScrollProviderProps {
  scrollRef: AppScrollRef;
  children: ReactNode;
}

export function AppScrollProvider({ scrollRef, children }: AppScrollProviderProps) {
  return (
    <AppScrollContext.Provider value={scrollRef}>
      {children}
    </AppScrollContext.Provider>
  );
}

export function useAppScrollRef() {
  return useContext(AppScrollContext);
}
