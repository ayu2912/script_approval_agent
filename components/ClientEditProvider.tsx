"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { AnimatePresence } from "framer-motion";
import ClientEditDrawer from "@/components/dashboard/ClientEditDrawer";
import ToastProvider from "@/components/ui/ToastProvider";

interface ClientEditContextValue {
  openEditDrawer: (id: string) => void;
}

const ClientEditContext = createContext<ClientEditContextValue>({
  openEditDrawer: () => {},
});

export function useClientEdit() {
  return useContext(ClientEditContext);
}

export default function ClientEditProvider({ children }: { children: ReactNode }) {
  const [editingClientId, setEditingClientId] = useState<string | null>(null);

  const openEditDrawer = useCallback((id: string) => {
    setEditingClientId(id);
  }, []);

  const handleClose = useCallback(() => {
    setEditingClientId(null);
  }, []);

  const handleSaved = useCallback(() => {
    setEditingClientId(null);
    window.dispatchEvent(new Event("client-updated"));
  }, []);

  return (
    <ClientEditContext.Provider value={{ openEditDrawer }}>
      {children}
      <ToastProvider>
        <AnimatePresence>
          {editingClientId && (
            <ClientEditDrawer
              clientId={editingClientId}
              onClose={handleClose}
              onSaved={handleSaved}
            />
          )}
        </AnimatePresence>
      </ToastProvider>
    </ClientEditContext.Provider>
  );
}
