
# AI Text Studio – Vollständiger Implementierungsplan

Ein konsolidiertes Premium-Text-Studio für Reasoning, Analyse und Schreiben – analog zum AI Video Toolkit, aber für Text. Drei Top-Tier-Modelle in einer einheitlichen UI, eingeordnet unter **Analyze** in der Sidebar.

---

## 1. Modelle & Provider

| Provider | Modell-ID intern | Quelle | Kosten (1M Tokens) | Stärke |
|---|---|---|---|---|
| OpenAI | `openai-gpt-5-5-pro` | Lovable AI Gateway | ~$15 / $75 | Reasoning, Code |
| Google | `google-gemini-3-1-pro` | Lovable AI Gateway | ~$1.25 / $10 | Multimodal, 1M Context |
| Anthropic | `anthropic-claude-4-1-opus` | Direkte Anthropic API (`ANTHROPIC_API_KEY`) | $15 / $75 | Schreiben, lange Texte |

Standard-Modell beim Öffnen: **Gemini 3.1 Pro** (günstigstes Pro-Modell).

---

## 2. Routen & Sidebar-Einbettung

- Neue Route: `/ai-text-studio`
- Sidebar-Eintrag „AI Text Studio" unter **Analyze**, oberhalb von Trend Radar (Icon: `Brain` von lucide).
- Hub-Card auf `/hubs/analyze` (falls vorhanden) mit gleicher Bento-Tile-Optik wie Video-Studios.

---

## 3. Seiten-Layout (Tabs)

```text
[ AI Text Studio ]                        Wallet: 12.40€  •  Modell: Gemini 3.1 Pro
─────────────────────────────────────────────────────────────────────
| Chat | Compare | Personas | History |
─────────────────────────────────────────────────────────────────────
```

### Tab 1 – Chat (MVP)
- Chat-Verlauf mit Markdown-Renderer (`react-markdown` + `remark-gfm`, bereits im Projekt vorhanden).
- Eingabefeld unten, Streaming-Antworten Token-für-Token.
- Top-Bar: Modell-Dropdown, Reasoning-Effort-Slider (nur GPT-5.5 Pro: minimal/low/medium/high/xhigh), System-Prompt-Picker (aus Personas).
- Live-Cost-Estimator: zeigt geschätzte Kosten basierend auf Input-Tokens.
- Buttons: „Neue Konversation", „Export (Markdown)", „Kopieren".

### Tab 2 – Compare (Killer-Feature)
- Eingabefeld oben, darunter 3 Spalten (eine pro Modell).
- „Run on all 3" → parallele Streaming-Antworten.
- Pro Spalte: Latenz, Kosten, Token-Count, Bewertungs-Buttons (👍/👎) → speichert in `text_studio_comparisons`.

### Tab 3 – Personas
- Vordefinierte System-Prompts: Strategy Analyst, Copywriter, Senior Coder, Researcher, Brand Voice Editor, Translator (DE/EN/ES), Social Media Strategist.
- User kann eigene Personas anlegen (gespeichert in `text_studio_personas`).

### Tab 4 – History
- Liste aller Konversationen, suchbar, mit Modell-Badge & Datum.
- Klick öffnet Chat im Read/Continue-Modus.

---

## 4. Datenbank (Migration)

```sql
-- Konversationen
create table public.text_studio_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Neue Konversation',
  model text not null,
  persona_id uuid references public.text_studio_personas(id) on delete set null,
  total_input_tokens int not null default 0,
  total_output_tokens int not null default 0,
  total_cost_eur numeric(10,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nachrichten
create table public.text_studio_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.text_studio_conversations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('system','user','assistant')),
  content text not null,
  model text,
  input_tokens int,
  output_tokens int,
  cost_eur numeric(10,4),
  reasoning_effort text,
  created_at timestamptz not null default now()
);

-- Personas (system prompts)
create table public.text_studio_personas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null = system preset
  name text not null,
  description text,
  system_prompt text not null,
  is_system_preset boolean not null default false,
  created_at timestamptz not null default now()
);

-- Compare runs
create table public.text_studio_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  prompt text not null,
  results jsonb not null, -- { model: { content, latency_ms, tokens, cost, rating } }
  created_at timestamptz not null default now()
);

-- RLS auf allen 4 Tabellen: user_id = auth.uid()
-- Personas zusätzlich: SELECT auch wenn is_system_preset = true
```

System-Personas werden per Seed-Insert (Insert-Tool) eingespielt.

---

## 5. Edge Functions

### `text-studio-chat` (Streaming)
- Input: `{ conversationId, messages, model, reasoningEffort?, systemPrompt? }`
- Validiert JWT, prüft Wallet-Balance (≥ geschätzte Cost).
- Router:
  - `openai-gpt-5-5-pro` / `google-gemini-3-1-pro` → Lovable AI Gateway (OpenAI-kompatibles SSE).
  - `anthropic-claude-4-1-opus` → Anthropic API `messages?stream=true`, SSE-Format wird in OpenAI-kompatibles Delta-Format umgewandelt, damit der Client einheitlich parsen kann.
- Streamt Tokens an Client.
- `EdgeRuntime.waitUntil(...)` speichert nach Abschluss: User-Message + Assistant-Message + Token-Counts + Cost in DB, dekrementiert Wallet.
- Fehler-Handling: 402 → „Wallet leer", 429 → „Rate Limit", 500 → idempotenter Refund (kein Spend).

### `text-studio-compare`
- Input: `{ prompt, systemPrompt? }`
- Ruft alle 3 Modelle **parallel** (kein Streaming, einfacher Sammelmodus).
- Returnt JSON `{ results: { model: { content, latency, tokens, cost } } }`.
- Speichert Run in `text_studio_comparisons`.

### `text-studio-rate-comparison`
- Input: `{ comparisonId, model, rating }` → updated `results` jsonb.

Alle 3 Functions im `supabase/config.toml` mit `verify_jwt = false` (manuelle JWT-Validierung im Code, Standard-Pattern im Projekt).

---

## 6. Secrets & Setup

- `LOVABLE_API_KEY` – bereits vorhanden (für Gateway).
- **`ANTHROPIC_API_KEY`** – muss vom User per `add_secret` hinzugefügt werden. Anleitung: `https://console.anthropic.com` → API Keys → Create Key.
- Falls Key fehlt: Claude-Option im UI greyed-out mit Tooltip „Anthropic API-Key in Settings hinzufügen".

---

## 7. Cost-Modell für End-User

Wallet-Abrechnung in EUR mit **30 % Marge** auf Provider-Kosten (analog zu HappyHorse-Pattern):

| Modell | Endkunden-Preis pro 1k In/Out Tokens |
|---|---|
| Gemini 3.1 Pro | €0.0016 / €0.013 |
| GPT-5.5 Pro | €0.0195 / €0.0975 |
| Claude 4.1 Opus | €0.0195 / €0.0975 |

UI zeigt geschätzten Preis live an, bevor User „Senden" drückt.

---

## 8. Frontend-Struktur

```text
src/pages/AITextStudio.tsx                 # Tab-Wrapper
src/components/text-studio/
├── ModelSelector.tsx                      # Dropdown mit Badges
├── ReasoningEffortSlider.tsx              # Nur sichtbar bei GPT-5.5 Pro
├── ChatView.tsx                           # Streaming Chat
├── MessageBubble.tsx                      # Markdown render
├── CompareView.tsx                        # 3-Spalten parallel
├── PersonaPicker.tsx
├── PersonaEditor.tsx
├── ConversationHistory.tsx
├── CostEstimator.tsx
└── WalletGuard.tsx
src/hooks/
├── useTextStudioChat.ts                   # Streaming-Hook
├── useTextStudioCompare.ts
└── useTextStudioConversations.ts
src/lib/text-studio/
├── models.ts                              # 3-Modell-Registry mit Pricing
└── pricing.ts                             # Token→EUR-Berechnung
```

---

## 9. Lokalisierung

Alle UI-Strings in DE/EN/ES (Core-Memory-Regel). System-Personas in 3 Sprachen. **Prompts/Inhalte selbst** werden in der UI-Sprache des Users generiert (analog Universal Content Creator Localization Policy).

---

## 10. Compliance & Sicherheit

- Footer-Disclaimer „Powered by OpenAI, Google & Anthropic" (analog AI Video Hub Compliance).
- Streaming-Antworten dürfen nicht gespeichert werden, falls User „Privater Modus" aktiviert (Toggle in Top-Bar) – dann kein DB-Write der Inhalte, nur Token-Counts für Billing.
- RLS strikt user-scoped. System-Personas read-only.

---

## 11. Implementierungs-Reihenfolge

1. **DB-Migration** (4 Tabellen + RLS + Seed Personas via Insert).
2. **Models Registry** (`src/lib/text-studio/models.ts`) + Pricing.
3. **Edge Function `text-studio-chat`** mit Gateway-Routing (ohne Anthropic).
4. **MVP-UI**: AITextStudio-Page mit ChatView + ModelSelector + History.
5. **Sidebar/Routing-Eintrag** unter Analyze.
6. **Anthropic-Integration**: Secret-Request, Provider-Branch in Edge Function, UI-Greyout-Logik.
7. **Compare-Tab** + `text-studio-compare` Edge Function.
8. **Personas-Tab** mit CRUD + System-Personas-Seed.
9. **Cost-Estimator + Wallet-Guard**.
10. **Privater Modus, Export-Buttons, Lokalisierung-Pass DE/EN/ES**.
11. **Memory-Eintrag** für AI Text Studio Architecture.

---

## 12. Out of Scope (Phase 2)

- File/Image-Upload für multimodale Anfragen
- Voice-Input (Whisper)
- Tool-Use / Web-Search innerhalb des Chats
- Team-Sharing von Konversationen
- A/B-Auto-Routing („wähle automatisch das beste Modell")

---

**Bevor wir starten:**
- Ich beginne mit Phase 1–5 (MVP mit Gemini & GPT-5.5 Pro, ohne Claude). Sobald die UI steht, frage ich dich nach dem **Anthropic API-Key** und schalte Claude scharf.
- Sag Bescheid, ob du das so freigibst, oder ob du noch Anpassungen am Scope/Naming/Tab-Struktur möchtest.
