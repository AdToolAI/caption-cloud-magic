## Ziel
Music Studio um 3 aktuelle Top-Engines erweitern und die alte Tier-Struktur (`quick/adaptive/standard/vocal/pro`) in einen sauberen **Engine-Katalog** umbauen, damit weitere Modelle künftig ohne UI-Refactor dazukommen können.

## Verfügbarkeitscheck (Stand 15.07.2026)

| Engine | API-Verfügbar? | Route | Sprachen | Preis (Provider) | Retail (3×) |
|---|---|---|---|---|---|
| **Suno v5** | Ja (Replicate `suno-ai/bark-suno-v5` bzw. offizielle Suno API) | Replicate | EN, DE, ES, FR, IT, PT, JA, KO, ZH + 20 weitere | ~$0.08 / Song | **0.30 €** |
| **Udio v2** | ❌ **Kein öffentliches API** (Udio Inc. bietet nur Web-UI; nur Drittanbieter-Scraper) | – | – | – | **Nicht integrierbar** |
| **ElevenLabs Music v2** | Ja (nativ, `api.elevenlabs.io/v1/music`, ElevenLabs-Connector bereits verbunden) | Direct | EN, DE, ES, FR, IT, PT + 20 weitere | ~$0.06 / 30s | **0.24 €** |
| **Stable Audio Open 2** | Ja (Replicate `stability-ai/stable-audio-open-2`) | Replicate | Instrumental-only | ~$0.03 / Track | **0.12 €** |

**Empfehlung:** Suno v5, ElevenLabs Music v2 und Stable Audio Open 2 aufnehmen. **Udio v2 weglassen** und dem User transparent kommunizieren — sonst müssten wir auf einen Grauzonen-Reseller setzen, was für ein Beta-Launch mit Zahlungsflow ein Compliance-Risiko wäre.

## Neuer Engine-Katalog

Ersetzt die alten Tiers. Namen bleiben pro Karte im UI klar erkennbar (Provider-Branding sichtbar, weil Kunden explizit „Suno" wollen).

| Karte | Engine | Vocals | Max Länge | Preis | Use-Case |
|---|---|---|---|---|---|
| **Adaptive (Loop)** | Stable Audio 2.5 | ❌ | 190s | 0.15 € | Background, loopable |
| **Adaptive Open** *(neu)* | Stable Audio Open 2 | ❌ | 47s | 0.12 € | Kurze Stings, günstig |
| **Vocal Mini** | MiniMax Music 1.5 | ✅ | 60s | 0.30 € | Schnelle Song-Skizze |
| **Vocal Pro (Suno)** *(neu)* | Suno v5 | ✅ | 240s | 0.45 € | Full Song, radio-ready |
| **Vocal Studio (EL)** *(neu)* | ElevenLabs Music v2 | ✅ | 300s | 0.36 € | Cinematic, mehrsprachig |

Alte `quick`/`standard`/`pro` werden entfernt (waren Duplikate/nie ausgeliefert).

## Umsetzung

### 1. Single-Source-of-Truth `src/lib/music/engineCatalog.ts` (neu)
Zentrale Registry mit `id, label, provider, vocals, maxDuration, priceEur, languages, replicateModel|nativeEndpoint`. Ersetzt hardcodete `MUSIC_TIER_PRICING`, `MUSIC_LANGUAGE_SUPPORT` und `tier: 'quick'|'adaptive'|…`-Union. Ein neues Modell = ein Eintrag im Katalog.

### 2. Edge Function `supabase/functions/generate-music-track/index.ts`
- Umstellung auf `engineId` statt `tier`.
- Neue Branches:
  - `suno-v5` → Replicate `suno-ai/…` mit `prompt`, `lyrics`, `style`, `duration` (Feld-Mapping wie MiniMax hardened).
  - `elevenlabs-music-v2` → Direct `POST https://api.elevenlabs.io/v1/music` (Connector-Key `ELEVENLABS_API_KEY`), binäres MP3 → Base64 → Storage-Upload (gleiche Pipeline wie MiniMax).
  - `stable-audio-open-2` → Replicate `stability-ai/stable-audio-open-2`.
- Detaillierte Provider-Fehler weiter durchreichen (wie zuletzt bei `MINIMAX_VALIDATION`).
- Idempotenter Credit-Refund bei Provider-Fail (bestehende Wallet-Logik).

### 3. UI `src/pages/MusicStudio.tsx` + `ProviderSelector.tsx`
- ProviderSelector rendert Karten aus `ENGINE_CATALOG` (Grid, 3 Spalten desktop, scrollbar mobil).
- Sprach-Dropdown liest `engine.languages` (bleibt versteckt bei Instrumental-Engines).
- Kostenanzeige und „Neues Projekt"-Reset bleiben unverändert.
- Bei Suno v5 zusätzlich Style-Feld („Genre-Tags, z. B. `pop, upbeat, female vocals`") — Suno-typisch.

### 4. Abwärtskompatibilität
`useMusicGeneration` mappt Legacy-`tier` → neue `engineId` (`adaptive`→`stable-audio-25`, `vocal`→`minimax-15`), damit vorhandene History-Einträge/Deep-Links nicht brechen.

### 5. Kommunikation Udio v2
Kein UI-Slot. Falls User explizit fragt: Info-Tooltip „Udio bietet aktuell kein öffentliches API" — wird in `MusicStudio.tsx` als Footer-Zeile hinzugefügt.

## Rollout
1. Katalog + Edge-Function-Branches (kein UI-Break, Legacy-Tiers bleiben eine Version parallel).
2. UI-Switch auf Katalog-basierte Karten.
3. Nach 1 Tag Smoke-Test: Legacy-Tier-Enum entfernen.

## Nicht enthalten
- Kein Udio-Reseller-Fallback.
- Keine Änderung an Voice Studio / Audio Library.
- Kein Preis-Umbau anderer Modalitäten.

## Rückfrage
Suno v5 offiziell nur mit Wasserzeichen im Free-Tier — auf Replicate ohne. Ich integriere über **Replicate** (konsistent mit den anderen Music-Modellen und deinem 3.00×-Margin-Framework). OK so, oder soll ich stattdessen die direkte Suno-API prüfen (eigener Key, kein Replicate-Aufschlag, aber separate Rate-Limit-Handhabung)?