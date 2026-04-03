"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ToastData {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

interface ToastContextValue {
  toast: (type: "success" | "error" | "info", message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((type: "success" | "error" | "info", message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className={cn(
                "px-4 py-3 rounded-lg text-sm font-medium border shadow-lg",
                t.type === "success" && "bg-[var(--card)] text-emerald-500 border-emerald-500/20",
                t.type === "error" && "bg-[var(--card)] text-red-400 border-red-500/20",
                t.type === "info" && "bg-[var(--card)] text-[var(--text)] border-[var(--border)]"
              )}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
