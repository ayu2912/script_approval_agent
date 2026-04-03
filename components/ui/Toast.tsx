"use client";

import { useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ToastData {
  type: "success" | "error";
  message: string;
}

export default function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const dismiss = useCallback(onDismiss, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(dismiss, 3000);
    return () => clearTimeout(timer);
  }, [dismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn(
        "fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium z-[60] border",
        toast.type === "success"
          ? "bg-[var(--card)] text-[var(--text)] border-emerald-500/20"
          : "bg-[var(--card)] text-red-400 border-red-500/20"
      )}
    >
      {toast.message}
    </motion.div>
  );
}
