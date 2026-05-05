# Floating Pinned Chat — App-weites Mini-Fenster

## Ziel
Im AI Text Studio kann der User den aktuellen Chat **anheften** ("Pin"). Danach erscheint überall in der App (Picture Studio, Composer, Director's Cut, Hub …) ein schwebendes, verschiebbares Fenster mit dem laufenden Chat. Der User kann darin weiterschreiben, ohne das Modul zu verlassen.

## UX
- **Pin-Button** im AI Text Studio Header (Pin-Icon neben „Neue Konversation").
- Klick → Chat wird in einen globalen Floating-Container überführt; im Studio erscheint ein Hinweis „Chat angeheftet — sichtbar in allen Modulen".
- **Floating-Fenster** (default ~360×480 px, bottom-right):
  - **Drag** an der Titelleiste (frei positionierbar, snap an Viewport-Ränder).
  - **Resize** über Eckgriff (min 280×320, max 720×900).
  - **Minimieren** → schrumpft zur kleinen Pille mit Modell-Label + ungelesen-Dot.
  - **Maximieren** → öffnet wieder Floating, oder „Im Studio öffnen" springt zurück zu `/ai-text-studio`.
  - **Schließen (X)** → unpin + Fenster zu (Chat bleibt in DB erhalten).
- Position + Größe in `localStorage` persistiert.
- Versteckt sich automatisch auf der Studio-Seite selbst (kein Doppel-UI).

## Architektur

### 1. Globaler State — `PinnedChatProvider`
Neuer Context in `src/contexts/PinnedChatContext.tsx`:
- `pinnedConversationId: string | null`
- `pinnedModel: TextModelId`
- `pinnedPersonaId / pinnedReasoning / pinnedIsPrivate`
- `windowState: { x, y, w, h, minimized }`
- Actions: `pin(conv)`, `unpin()`, `setWindowState(...)`
- Persistenz: gesamter State in `localStorage('pinned-chat-v1')`.
- Provider in `src/App.tsx` ganz außen einhängen.

### 2. Floating-Komponente — `PinnedChatWindow.tsx`
- Rendered einmal global (z.B. in `App.tsx` neben `<Toaster/>`), nur wenn `pinnedConversationId` gesetzt ist und aktuelle Route ≠ `/ai-text-studio`.
- Nutzt **react-rnd** (bereits leichtgewichtige Dependency, sonst manueller Drag mit `useRef + pointer events`).
  - Falls keine Lib-Erweiterung gewünscht: minimaler eigener Drag-Hook (mousedown auf Header → onMouseMove update x/y).
- Inhalt: schlanker Re-use der bestehenden Chat-Logik (Messages-Liste, Input, send via `text-studio-chat` edge function). Wird in eigene wiederverwendbare Komponente extrahiert: `src/components/text-studio/ChatPane.tsx` (Props: `conversationId`, `model`, `persona`, `reasoning`, `isPrivate`, `compact?`).
- Header: Modell-Badge, Drag-Handle, Buttons (Minimize, Open in Studio, Close).
- z-index: `z-[60]`, Glassmorphism passend zum Bond-Design (deep black + gold accent border).

### 3. Refactor `AITextStudio.tsx`
- Bestehende Chat-Logik (Messages-State, send-Funktion, Stream-Handling) in die neue `ChatPane.tsx` extrahieren → wird sowohl im Studio (full size) als auch im Floating-Fenster (compact) verwendet.
- Pin-Button im Header: ruft `pin({ conversationId, model, personaId, reasoning, isPrivate })`.
- Wenn `pinnedConversationId === conversationId` → Button zeigt „Pinned" + erlaubt Unpin.

### 4. Synchronisation
- Beide Instanzen (Studio + Floating) lesen Messages aus DB über die gleiche `conversationId`.
- Live-Sync via Supabase Realtime auf `text_studio_messages` (filter `conversation_id`) — neue Nachrichten erscheinen sofort in beiden Ansichten.
- Bei `unpin` bleibt der Chat in der DB; nur das Fenster schließt.

## Technische Details
- Drag/Resize: eigener Hook `useDraggableResizable` (ohne neue Dependency) — Pointer Events, Boundary-Clamping an `window.innerWidth/Height`.
- Mobile: auf Viewport < 768 px wird das Floating-Fenster zur Bottom-Sheet (full-width, swipe-to-dismiss). Pin-Button auf Mobile versteckt (oder zeigt Hinweis „Nur auf Desktop").
- Realtime-Channel wird einmal im Provider angelegt, nicht pro Komponente.
- Keine DB-Migration nötig.

## Out of scope
- Multi-Chat-Pinning (nur 1 angehefteter Chat gleichzeitig).
- Drag zwischen Monitoren / Multi-Window.
- Branch-Switcher im Floating-Fenster (nur im Studio sichtbar; Floating zeigt aktuellen Branch).
