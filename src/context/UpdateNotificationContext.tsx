import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { api, listenForSkillsChanged } from "../api";

interface UpdateNotificationContextType {
  updatableCount: number;
  setUpdatableCount: (count: number) => void;
  refreshUpdatableCount: () => Promise<void>;
}

const UpdateNotificationContext = createContext<UpdateNotificationContextType | null>(null);

export function UpdateNotificationProvider({ children }: { children: React.ReactNode }) {
  const [updatableCount, setUpdatableCount] = useState(0);
  const refreshRequestIdRef = useRef(0);

  const refreshUpdatableCount = useCallback(async () => {
    const requestId = ++refreshRequestIdRef.current;
    try {
      const skills = await api.listSkills();
      if (requestId === refreshRequestIdRef.current) {
        setUpdatableCount(skills.filter((s) => s.status === "update_available").length);
      }
    } catch {
      // Silently ignore - badge is a non-critical hint
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForSkillsChanged(() => {
      void refreshUpdatableCount();
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }

        unlisten = cleanup;
        void refreshUpdatableCount();
      })
      .catch(() => {
        if (!disposed) void refreshUpdatableCount();
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refreshUpdatableCount]);

  return (
    <UpdateNotificationContext.Provider
      value={{ updatableCount, setUpdatableCount, refreshUpdatableCount }}
    >
      {children}
    </UpdateNotificationContext.Provider>
  );
}

export function useUpdateNotification() {
  const ctx = useContext(UpdateNotificationContext);
  if (!ctx) {
    throw new Error("useUpdateNotification must be used within an UpdateNotificationProvider");
  }
  return ctx;
}
