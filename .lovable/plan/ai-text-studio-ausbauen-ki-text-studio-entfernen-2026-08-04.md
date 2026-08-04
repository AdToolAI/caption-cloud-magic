# AI Text Studio ausbauen, KI Text-Studio entfernen

## Ziel
Ein einziges Text-Studio. Statt einem Modell pro Anbieter bekommt der Kunde je Anbieter drei Qualitätsstufen (Schnell / Ausgewogen / Maximum) plus Reasoning-Regler, wo das Modell es unterstützt.

## Teil 1 — KI Text-Studio (/generator) entfernen
- Seite `src/pages/Generator.tsx` samt Generator-Komponenten entfernen.
- Route `/generator` entfernen; `/generator` und `/prompt-wizard` leiten auf `/ai-text-studio` um, damit alte Links und Lesezeichen nicht ins Leere laufen.
- Verweise bereinigen in: Hub-Kachel „KI Text-Studio" (Optimieren), Command Palette, CommandBar, QuickActions, proaktive Tipps, Auth-/VerifyEmail-/Kampagnen-Links, Image-Caption-Pairing-Weiterleitung.
- Die Caption-Funktion entfällt ersatzlos (so entschieden).

## Teil 2 — Modell-Matrix statt Einzelmodelle
Neue Auswahl in zwei Schritten: erst Anbieter, dann Stufe.

| Anbieter | Schnell | Ausgewogen | Maximum |
| --- | --- | --- | --- |
| OpenAI | GPT-5.6 Luna | GPT-5.6 Terra | GPT-5.6 Sol |
| Google | Gemini 3.1 Flash Lite | Gemini 3.6 Flash | Gemini 3.1 Pro |
| Anthropic | – | – | Claude 4.1 Opus (eigener Key) |

- Jede Stufe zeigt Preis pro 1k Tokens, Kontextfenster und Stärken-Badges.
- Kostenvorschau im Composer aktualisiert sich live mit der Auswahl.

## Teil 3 — Mehr Steuerung im Chat
- **Reasoning-Aufwand**: Regler (minimal → hoch) nur bei Modellen, die es unterstützen; sonst ausgeblendet statt wirkungslos.
- **Antwortlänge**: kurz / normal / ausführlich (Output-Token-Limit + Prompt-Hinweis).
- **Kreativität**: Präzise / Ausgewogen / Kreativ (Temperature).
- Alle Einstellungen werden je Konversation gespeichert und beim Laden wiederhergestellt.
- Bestehende Branch-Logik bleibt: Modellwechsel im laufenden Chat fragt weiterhin nach Branch mit/ohne Kontext.
- Modell-Vergleich (Compare-Tab) nutzt dieselbe Matrix, Auswahl von bis zu drei Stufen.

## Technische Details
- `src/lib/text-studio/models.ts`: Registry auf `{ provider, tier }` umstellen, alle Modell-IDs aus dem Gateway-Katalog, inkl. `supportsReasoningEffort` und Preisen mit bestehender Marge.
- `supabase/functions/text-studio-chat/index.ts`: `PROVIDER_MAP` und `PRICING` um alle neuen IDs erweitern; `reasoning_effort` bei GPT-5.6-Modellen zwingend mitsenden (`none`, wenn der Regler aus ist), `max_completion_tokens` und `temperature` aus der Anfrage durchreichen, unbekannte Modelle weiterhin mit 400 ablehnen.
- `supabase/functions/text-studio-compare/index.ts`: gleiche Registry-Erweiterung.
- Migration: Spalten `response_length`, `temperature` und `reasoning_effort` auf `text_studio_conversations` für die Wiederherstellung der Einstellungen.
- Guthaben-Abrechnung und Wallet-Prüfung bleiben unverändert, rechnen nur mit den neuen Preisen.

## Nicht betroffen
Lip-Sync-Pipeline, Motion Studio, Mediathek, Image-Caption-Pairing (bleibt als eigene Seite bestehen).
