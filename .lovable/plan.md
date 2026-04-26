## 🎵 AI Music Generator – Audio Studio Erweiterung

Füllt die letzte Lücke gegen Artlist AI Music. Nutzt **ElevenLabs Music API** als Hauptengine (Studio-Qualität, bis 5 Min, vollständig kommerziell nutzbar) und **Replicate MusicGen (Meta)** als günstigen Fallback. Beide Keys sind bereits im Projekt konfiguriert.

### 🎯 Strategische Entscheidung: Warum nicht Suno?

- **Suno**: Keine offizielle Public API, nur inoffizielle Reverse-Engineered Wrapper → rechtlich riskant, Lizenz-Grauzone bei kommerzieller Nutzung
- **ElevenLabs Music** ✅: Offizielle API, Studio-Qualität, voller kommerzieller Lizenz-Stack, bereits in unserem Tech-Stack (TTS), `ELEVENLABS_API_KEY` schon konfiguriert
- **Replicate MusicGen (Meta)** ✅: Open-Source-Modell, günstig (~$0.02 / 8s), Fallback für längere/instrumentale Tracks

### 💰 Pricing (konsistent mit AI Credits System – 30%/70% Marge wie Bilder/Videos)

| Tier | Engine | Dauer | Kosten ElevenLabs | User-Preis |
|------|--------|-------|---|---|
| **Quick** | MusicGen (Replicate) | bis 30s | ~$0.04 | **€0.10** |
| **Standard** | ElevenLabs Music | bis 60s | ~$0.20 | **€0.35** |
| **Pro** | ElevenLabs Music | bis 5 Min | ~$0.80 | **€1.40** |

Abgerechnet über das bestehende `ai_video_wallets` (Euro-Cent) → konsistent mit Picture Studio und allen Video-Studios. Nutzer sieht "AI Credits".

### 🏗️ Architektur

#### 1. Neue Edge Function: `generate-music-track`
- **Input**: `{ prompt, duration_seconds, tier: 'quick'|'standard'|'pro', genre?, mood?, instrumental? }`
- **Flow**:
  1. Auth check + Wallet-Balance prüfen via RPC
  2. Tier-Routing: `quick` → Replicate MusicGen, `standard`/`pro` → ElevenLabs `/v1/music`
  3. Audio-Bytes empfangen → in `audio-studio` Storage Bucket speichern (Pfad: `{user_id}/music/{timestamp}.mp3`)
  4. Eintrag in `universal_audio_assets` mit `type: 'music'`, `source: 'ai_generated'`, `processing_preset: tier`, prompt im `effect_config`
  5. `deduct_ai_video_credits` RPC → idempotent über `generation_id`
  6. Bei Fehler: Refund automatisch (gemäß Memory `failure-credit-refund-automation`)
- Timeout: 120s in `supabase/config.toml`

#### 2. Neue Komponente: `MusicGeneratorPanel.tsx` (`src/components/audio-studio/`)
- **Hero-Header** im James-Bond-2028 Stil (Glassmorphism, Gold/Cyan)
- **Prompt-Textarea** mit Beispielen ("Cinematic orchestral build-up", "Lo-fi chill beats with rain")
- **Genre-Chips**: Cinematic, Electronic, Hip-Hop, Lo-Fi, Corporate, Ambient, Rock, Pop, Classical, Jazz
- **Mood-Slider**: Energy (Calm ↔ Hype), Brightness (Dark ↔ Bright)
- **Duration-Slider**: 10s – 300s (mit Tier-Anzeige live)
- **Instrumental Toggle**: Mit/ohne Vocals
- **Tier-Selector**: 3 Karten (Quick / Standard / Pro) mit Live-Preis-Badge
- **Generate Button**: Zeigt Endpreis (z.B. "Generate · 35 Credits")
- **Result Preview**: Waveform-Player (wiederverwendet `TranscriptWaveformEditor`-Style), Download, "In Bibliothek speichern" (automatisch), "An Beat-Sync senden" → wechselt Tab

#### 3. Integration in `AudioStudio.tsx`
- Neuer Tab `'music'` in der bestehenden `activeTab` State-Union (zwischen `enhance` und `library`)
- Tab-Icon: `Music2` (lucide), Label: "AI Music"
- Generierte Tracks erscheinen automatisch in **SoundLibrary** und **BeatSyncTimeline** (gleiche Tabelle `universal_audio_assets`)

#### 4. Lokalisierung (EN / DE / ES)
Pro Memory-Regel: UI komplett übersetzt, **Prompt-Beispiele bleiben Englisch** für beste Modell-Qualität.

### 📦 Dateien (Erstellen / Ändern)

**Neu:**
- `supabase/functions/generate-music-track/index.ts`
- `src/components/audio-studio/MusicGeneratorPanel.tsx`
- `src/hooks/useMusicGeneration.ts` (Wrapper für Edge-Function-Call + Toast + Wallet-Refresh)

**Geändert:**
- `src/pages/AudioStudio.tsx` → Tab + Routing
- `src/components/audio-studio/AudioStudioHeroHeader.tsx` → Pill "AI Music Gen" hinzufügen
- `supabase/config.toml` → Function-Block mit `verify_jwt = true` und 120s Timeout
- `src/i18n/*.json` (3 Sprachen)

### 🔐 Sicherheit & Robustheit
- JWT-Verifizierung an, User-ID aus Auth-Context (nie aus Body)
- Storage-Pfad: `{user_id}/music/...` → respektiert RLS-Policy aus Memory `background-projects-rls-path-constraint`
- Prompt-Sanitization (max 500 chars, Zod-Schema)
- Rate-Limit: max 10 Generierungen / Stunde / User (Upstash Redis, schon konfiguriert)
- Idempotenter Refund bei API-Fehler oder Timeout
- Fallback-Kette: ElevenLabs `429` → automatischer Retry nach 3s, danach Refund + klare Toast-Message

### ✅ Akzeptanzkriterien
1. Nutzer generiert 30s Lo-Fi Track für €0.10 → Track in <15s in Library, abspielbar, downloadbar
2. Wallet-Balance wird **erst nach erfolgreicher Generierung** abgebucht (Reserve → Commit Pattern)
3. Track erscheint sofort in `BeatSyncTimeline` für Video-Editing
4. Bei API-Fail: Credits werden automatisch refunded, Toast zeigt klaren Fehler
5. Mobile-responsive (1193px Viewport bereits getestet, plus 375px)
6. Vollständig DE/EN/ES lokalisiert

### 🚀 Nicht im Scope (Phase 2)
- Stem-Separation (Vocals/Drums/Bass extrahieren)
- Voice-Cloning für Custom Vocals
- BPM-Match zu vorhandenem Video (wäre logischer V2-Schritt mit `analyze-music-bpm` Function, die schon existiert)
- Marketplace für Community-Tracks

---

**Soll ich loslegen?**