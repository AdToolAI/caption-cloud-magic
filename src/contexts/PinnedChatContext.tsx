import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import type { TextModelId, ReasoningEffort } from "@/lib/text-studio/models";

export interface PinnedChatPayload {
  conversationId: string;
  model: TextModelId;
  personaId?: string | null;
  systemPrompt?: string | null;
  reasoning?: ReasoningEffort;
  isPrivate?: boolean;
  title?: string;
}

export interface WindowState {
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
}

interface Ctx {
  pinned: PinnedChatPayload | null;
  windowState: WindowState;
  pin: (p: PinnedChatPayload) => void;
  unpin: () => void;
  setWindowState: (s: Partial<WindowState>) => void;
}

const STORAGE_KEY = "pinned-chat-v1";

const defaultWindow: WindowState = {
  x: typeof window !== "undefined" ? Math.max(20, window.innerWidth - 400) : 100,
  y: typeof window !== "undefined" ? Math.max(20, window.innerHeight - 540) : 100,
  w: 380,
  h: 500,
  minimized: false,
};

const PinnedChatContext = createContext<Ctx | null>(null);

export function PinnedChatProvider({ children }: { children: ReactNode }) {
  const [pinned, setPinned] = useState<PinnedChatPayload | null>(null);
  const [windowState, setWindowStateRaw] = useState<WindowState>(defaultWindow);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.pinned) setPinned(parsed.pinned);
        if (parsed.windowState) setWindowStateRaw({ ...defaultWindow, ...parsed.windowState });
      }
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ pinned, windowState }));
    } catch {}
  }, [pinned, windowState]);

  const pin = useCallback((p: PinnedChatPayload) => setPinned(p), []);
  const unpin = useCallback(() => setPinned(null), []);
  const setWindowState = useCallback(
    (s: Partial<WindowState>) => setWindowStateRaw((prev) => ({ ...prev, ...s })),
    [],
  );

  return (
    <PinnedChatContext.Provider value={{ pinned, windowState, pin, unpin, setWindowState }}>
      {children}
    </PinnedChatContext.Provider>
  );
}

export function usePinnedChat() {
  const ctx = useContext(PinnedChatContext);
  if (!ctx) throw new Error("usePinnedChat must be used within PinnedChatProvider");
  return ctx;
}
