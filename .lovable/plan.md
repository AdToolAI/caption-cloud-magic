# AI Text Studio — Hybrid Branch beim Modellwechsel

## Problem
Wenn man mitten im Chat das Modell wechselt (z.B. Gemini → GPT-5.5 Pro), wird die volle History an das neue Modell geschickt. Reasoning-Modelle und Anthropic erwarten andere Message-Formate als Gemini → der Provider gibt einen Fehler zurück ("Upstream provider error"). Lange Verläufe sprengen zusätzlich Kontext-Limits.

## Lösung
**Hybrid Branch-Modus**: Beim Modellwechsel innerhalb eines aktiven Chats wird automatisch ein neuer "Branch" als eigene Konversation angelegt, die optional die bisherige History als Kontext mitnimmt — aber mit dem Ziel-Modell sauber neu startet. Beide Branches bleiben sichtbar und navigierbar.

```text
Chat "Kreuzzüge"
├─ 🟢 Branch 1: Gemini 3 Flash       (5 Nachrichten)
├─ ⚪ Branch 2: GPT-5.5 Pro          (ab Nachricht 5, mit Kontext-Snapshot)
└─ ⚪ Branch 3: Claude 4.1 Opus      (ab Nachricht 5, mit Kontext-Snapshot)
```

## Änderungen

### 1. Datenbank-Migration
Neue Spalten in `text_studio_conversations`:
- `parent_conversation_id uuid` — Referenz zur Eltern-Konversation (NULL = Root)
- `branched_from_message_id uuid` — ab welcher Nachricht abgezweigt wurde
- `branch_label text` — kurzer Anzeigename ("Gemini-Branch", "GPT-Branch")

Bestehende Konversationen bleiben unberührt (alle als Roots, weil `parent_conversation_id` NULL).

### 2. Branch-Logik im Frontend (`src/pages/AITextStudio.tsx`)
- Wenn `messages.length > 0` und User wechselt Modell → Bestätigungs-Dialog:
  > „Mit GPT-5.5 Pro fortfahren? Es wird ein neuer Branch erstellt. Möchtest du den bisherigen Verlauf als Kontext übernehmen?"
  - **Ja, mit Kontext** → neuer Branch, History wird als Snapshot kopiert
  - **Ja, sauber** → neuer Branch, leer
  - **Abbrechen** → Modell bleibt unverändert
- Branch-Switcher-Leiste über dem Chat: zeigt alle Branches dieser Wurzel mit Modell-Badge, Klick wechselt Branch.

### 3. History-Sanitizer im Edge Function (`supabase/functions/text-studio-chat`)
Robustheit gegen kreuzweise Inkompatibilität:
- Vor dem Upstream-Call: Messages bereinigen (nur `role` + `content` als Plain-Text, keine Tool-Calls, kein Reasoning-Payload).
- Wenn History > 60.000 Zeichen → ältere User/Assistant-Paare automatisch zusammenfassen (mit Gemini Flash) statt hart abzuschneiden.
- Bessere Error-Surface: Statt generischem „Upstream provider error" → konkrete HTTP-Status + erste 200 Zeichen der Provider-Antwort als Toast.

### 4. History-Tab Update
- Konversationen werden gruppiert nach `parent_conversation_id`.
- Root-Konversation als aufklappbare Zeile, Branches eingerückt darunter mit Modell-Badge.
- Existing Chats werden ihrem `model`-Feld zugeordnet (Spalte ist bereits vorhanden und befüllt) — keine Daten-Migration nötig.

## Technische Details (für später)
- Branch-Erstellung passiert client-seitig: neue Row in `text_studio_conversations` mit `parent_conversation_id = currentRoot`, dann optional `INSERT` der bestehenden Messages mit neuer `conversation_id`.
- `currentRoot` = `parent_conversation_id ?? id` der aktuell aktiven Konversation.
- Edge Function unverändert bzgl. Persistenz — bekommt einfach die neue `conversationId`.
- Sanitizer: `messages.map(m => ({ role: m.role, content: String(m.content || '') })).filter(m => m.content.trim())`.

## Out of Scope
- Kein Auto-Merge von Branches (würde A/B-Vergleich brechen).
- Kein Realtime-Sync zwischen Branches.
