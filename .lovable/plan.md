## Ziel
Suno v5 aus dem Music-Studio-Katalog entfernen (kein offizieller API-Zugang) und stattdessen die zwei besten aktuell verfügbaren Engines laut deiner Bewertung ergänzen: **Google Lyria 3 Pro** (Preview) und **Stable Audio 3.0 Large**. ElevenLabs Music v2 bleibt als Top-Empfehlung.

## Neuer Katalog (final)

| Karte | Engine | Vocals | Max Länge | Retail | Route | Use-Case |
|---|---|---|---|---|---|---|
| **Adaptive (Loop)** | Stable Audio 2.5 | ❌ | 190s | 0.15 € | Replicate | Background, loopable |
| **Adaptive Large** *(ersetzt Open 2)* | Stable Audio 3.0 Large | ❌ | 190s | 0.18 € | Direct API (Stability) | Höchste Instrumental-Qualität |
| **Vocal Mini** | MiniMax Music 1.5 | ✅ | 60s | 0.30 € | Replicate | Schnelle Song-Skizze |
| **Vocal Studio (EL)** ⭐ | ElevenLabs Music v2 | ✅ | 300s | 0.36 € | Direct API | Beste Gesamtlösung, mehrsprachig |
| **Vocal Pro (Lyria)** *(neu, ersetzt Suno)* | Google Lyria 3 Pro | ✅ | 30–60s (Preview) | 0.42 € | Vertex AI / Gemini API | Google Preview, radio-nahe Qualität |

**Entfällt:**
- **Suno v5** — kein offizieller API-Zugang, Drittanbieter/Scraper wären Compliance-Risiko.
- **Stable Audio Open 2** — durch das stärkere Stable Audio 3.0 Large ersetzt.

## Umsetzung

### 1. `src/lib/music/engineCatalog.ts`
- `suno-v5` Eintrag entfernen.
- `stable-audio-open-2` → `stable-audio-3-large` umbenennen (Preis, maxDuration, Label anpassen).
- Neuer Eintrag `lyria-3-pro` mit `vocals: true`, Sprach-Set (EN, DE, ES, FR, IT, PT, JA), 60s Max.
- Legacy-Mapping in `useMusicGeneration` erweitern: alte `suno-v5`-IDs aus History → `elevenlabs-music-v2` (nächstbeste Vocal-Engine).

### 2. Edge Function `supabase/functions/generate-music-track/index.ts`
- `suno-v5` Branch komplett entfernen (inkl. Suno-Job-Polling, `SUNO_API_KEY` Check, `SUNO_NOT_CONFIGURED` Fehlercode).
- Neuer Branch **`stable-audio-3-large`**: Stability AI Direct API `POST https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio` (v3 Large Endpoint), Auth via neuer Secret `STABILITY_API_KEY`. Binary MP3 → Base64 → Storage-Upload (bestehende Pipeline).
- Neuer Branch **`lyria-3-pro`**: Google Vertex AI / Gemini API `POST https://generativelanguage.googleapis.com/v1beta/models/lyria-3-pro:generateMusic` (bzw. Vertex-Endpoint), Auth via neuer Secret `GOOGLE_LYRIA_API_KEY`. Response = base64 audio → Storage.
- Bestehende Branches (Stable Audio 2.5, MiniMax 1.5, ElevenLabs Music v2) bleiben unverändert.
- Idempotenter Credit-Refund bei Provider-Fail bleibt aktiv.
- Detaillierte Provider-Fehler unverändert durchgereicht.

### 3. UI `src/pages/MusicStudio.tsx` + `ProviderSelector.tsx`
- Kein struktureller Umbau — Katalog ist bereits Single-Source-of-Truth.
- Icons für neue Engines: `Sparkles` (Lyria), `Waves` bleibt für Stable Audio 3.0 Large.
- Info-Zeile „Suno bietet aktuell keinen offiziellen API-Zugang, daher setzen wir stattdessen auf ElevenLabs Music v2 und Google Lyria 3 Pro" als kleiner Footer-Hinweis.
- ⭐ Badge auf ElevenLabs (Beste Gesamtlösung laut interner Qualitätsbewertung).

### 4. Secrets
Zwei neue Secrets werden benötigt (nach Plan-Freigabe per `add_secret`):
- `STABILITY_API_KEY` — https://platform.stability.ai/account/keys
- `GOOGLE_LYRIA_API_KEY` — Google AI Studio / Vertex AI (Lyria 3 Pro ist aktuell in **Preview** — Access-Approval nötig; Fallback: Karte disabled + Hinweis „In Kürze verfügbar", falls Key fehlt, analog zum bisherigen Suno-Muster).

### 5. Toast-Codes
- `SUNO_NOT_CONFIGURED` → entfernt.
- Neu: `LYRIA_NOT_CONFIGURED` (Preview-Access noch offen) + `STABILITY_NOT_CONFIGURED`.

## Nicht enthalten
- Kein Umbau Voice-Studio / Audio-Library / Cast&World.
- Keine Preisänderung anderer Modalitäten.
- Kein Suno-Scraper-Fallback.

## Rückfrage
**Lyria 3 Pro** ist aktuell noch **Preview** bei Google (Zugang nur nach Approval via Vertex AI Waitlist). Zwei Wege:
- **A) Sofort integrieren, Karte disabled, bis dein Google-Access freigeschaltet ist** (empfohlen — UI zeigt „Bald verfügbar", Nutzer sehen die Roadmap).
- **B) Erst integrieren, wenn dein Vertex-AI-Access aktiv ist** (Katalog startet mit 4 Engines).

Welchen Weg soll ich fahren?
