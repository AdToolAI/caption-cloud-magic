# Support Center — Level Up zu "Evidence-First"

Ziel: Kunden sollen Bilder/Videos hochladen wollen. Wir verkaufen aktiv den Nutzen (60% schnellere Fixes) und machen das Hochladen so einfach wie möglich — inkl. One-Click Screen-Recording.

## 1. "Evidence Boost" Hero-Banner (Schritt 1 + Schritt 3)
- Goldener Glow-Banner direkt unter dem Schritt-Indikator:
  > ⚡ **Tickets mit Screenshot oder Screen-Recording werden im Schnitt 60% schneller gelöst.**
- In Schritt 3 als großer "Pro-Tipp"-Card mit Icon (Sparkles + Camera), nicht nur als Pflichtfeld.
- Lokalisiert DE / EN / ES.

## 2. Media Upload Promotion in Schritt 1
- Neue Sektion "Screenshot oder Recording hinzufügen (empfohlen)" direkt unter dem Subject-Feld — User kann schon in Step 1 droppen, nicht erst in Step 3.
- Dezenter "+60% Speed"-Badge auf dem Upload-Bereich.
- Bei Kategorie **Bug** oder **Render-Problem** und Severity **High/Blocking**: Banner wird rot/dringend mit Text "Ohne Visual können wir diesen Fall meist nicht reproduzieren — bitte Screenshot anhängen."

## 3. One-Click Screen Recording (NEU)
- Neuer Button im AttachmentUploader: **"📹 Bildschirm aufnehmen"** (max 60s).
- Nutzt `navigator.mediaDevices.getDisplayMedia` + `MediaRecorder` (WebM, Browser-nativ, keine externe Lib).
- Mini-Toolbar während Aufnahme: Timer + Stop-Button.
- Nach Stop: Auto-Upload in `support-attachments` Bucket, erscheint sofort als Thumbnail.
- Fallback-Hinweis bei nicht-unterstützten Browsern (Safari iOS).

## 4. Smart Paste (Screenshot aus Clipboard)
- `paste`-Event-Listener auf Wizard-Root: Wenn User Cmd/Ctrl+V drückt und Clipboard ein Bild enthält → direkt zu Attachments hinzufügen, Toast "Screenshot aus Zwischenablage angehängt ✓".

## 5. AI Media Coach (Pre-Submit Check)
- Beim Klick auf "Ticket senden" (wenn 0 Attachments und Kategorie ∈ {bug, rendering, publishing, technical}):
  - Modal: "⚠️ Ohne Visual dauert die Lösung im Schnitt 60% länger. Möchtest du trotzdem ohne senden?"
  - Buttons: "Bild/Video hinzufügen" (primary, gold) ↔ "Ohne senden" (secondary, ghost).
- Bei Severity = blocking ohne Media: zusätzlich Text "Wir empfehlen für blockierende Fälle dringend ein Recording."

## 6. Triage-Boost im Backend
- `send-support-ticket` / `triage-support-ticket`: Wenn `attachments.length > 0` und mind. 1 Bild/Video dabei → `ai_priority_boost = true` und ETA-Estimate × 0.6 (Gemini-Prompt erweitert um "Ticket has visual evidence — assume 60% faster reproduction time").
- Admin-Inbox zeigt grünen **📎 Evidence**-Badge bei Tickets mit Media-Anhang, damit Bearbeiter diese priorisieren.

## 7. Persistent "Why Media Helps"-Helper (Schritt 3)
- Kleine Karte neben dem Uploader:
  - "✅ Screenshot zeigt UI-Zustand"
  - "✅ Recording zeigt den exakten Klickpfad"
  - "✅ Konsolen-Errors werden automatisch mitgeschickt"
- Plus: Live-Counter wie viele Tickets diese Woche durch Media schneller gelöst wurden (statisch fake nicht — read aus `support_tickets where attachments_count > 0 and resolved_at < expected_at` der letzten 7 Tage, sonst Text "Pro-Tipp: Recording = schnellste Lösung").

## Technische Details

**Files to edit:**
- `src/components/support/SupportWizard.tsx` — Evidence-Banner, Upload in Step 1, AI Media Coach Modal, Smart Paste Listener.
- `src/components/support/AttachmentUploader.tsx` — Screen-Recording Button + MediaRecorder Hook + 60%-Badge.
- `src/components/support/EvidenceBoostBanner.tsx` *(neu)* — wiederverwendbar für Step 1 + 3, lokalisiert.
- `src/hooks/useScreenRecorder.ts` *(neu)* — kapselt `getDisplayMedia` + `MediaRecorder` (start/stop/blob).
- `supabase/functions/triage-support-ticket/index.ts` — `has_visual_evidence` flag im Prompt, ETA × 0.6.
- `src/components/admin/qa-cockpit/SupportInboxTab.tsx` — 📎 Evidence-Badge auf Ticket-Cards.

**Keine DB-Migration nötig** — `attachments` ist bereits ein jsonb-Array auf `support_tickets`.

**Browser-Kompatibilität:** `getDisplayMedia` läuft auf Chrome/Edge/Firefox Desktop; Safari iOS bekommt Fallback-Hinweis "Screen-Recording nicht verfügbar — bitte Screenshot hochladen".

## Out-of-Scope (bewusst nicht jetzt)
- Server-side Video-Transcoding (Browser liefert WebM, das reicht für Support).
- Annotation-Tools (Pfeile/Kringel auf Screenshots) — späterer Polish.
