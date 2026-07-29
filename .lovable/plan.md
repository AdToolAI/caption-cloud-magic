## Autopilot Stage 3 — Vom Szenen-Stapel zum fertigen Spot

Heute endet der Autopilot bei `scenes_ready`: einzelne Clips, kein Ton, kein Schnitt, keine Abrechnung. Stage 3 schließt die Kette bis zum abspielbaren MP4.

### 1. Echte Credit-Verrechnung (Reserve → Commit → Refund)

- Abgerechnet wird pro Stufe (Anchor, Motion, VO, Lip-Sync, Finalrender) gegen `ai_video_wallets` / `ai_video_transactions`, nicht als Pauschale am Anfang.
- Neuer Shared-Helper `supabase/functions/_shared/autopilotCredits.ts`:
  - `charge()` mit Idempotenz-Schlüssel `autopilot:{productionId}:{stage}:{sceneIndex}` in der Transaktions-Beschreibung — ein Retry bucht nie doppelt ab.
  - `refund()` für abgebrochene oder fehlgeschlagene Stufen (Pflicht laut Credit-Reliability-Regel).
- Vor dem Start prüft der Orchestrator die Gesamtschätzung aus `costEstimate.ts` gegen das Guthaben und bricht sauber ab, statt mitten in der Produktion stecken zu bleiben.

### 2. Ton: Voiceover, Musik, Foley

- **Voiceover**: `generate-video-voiceover` wird pro Szene mit dem Szenentext, der gewählten Stimme und der Sprache aufgerufen (Service-Role-Aufruf ist dort bereits unterstützt). Sprachvertrag der Plattform gilt: Deutsch bleibt Deutsch.
- **Musik**: Auswahl über `search-stock-music` nach Stimmung des Treatments, danach Proxy in den eigenen Storage (Hotlink-Stabilität für Lambda) — dasselbe Muster wie im Universal Creator.
- **Mix**: Musik auf 0.25–0.3 unter dem VO, Ein-/Ausblendung an den Rhythmus-Markern aus `rhythm.ts`.
- Foley/Ambience bleibt in Stage 3 auf die Musik-/VO-Ebene beschränkt; Einzelsound-Layer folgt später.

### 3. Lip-Sync für Sprech-Szenen

- Szenen, die in der Grammatik als Sprech-Szene markiert sind, laufen nach dem Motion-Schritt durch die bestehende Lip-Sync-Strecke (`lip-sync-video`) mit dem Szenen-VO als Audio.
- Ergebnis ersetzt die Clip-URL der Szene; bei Fehlschlag wird die Stufe erstattet und der stumme Clip behalten, statt die ganze Produktion zu killen.

### 4. Endschnitt: `autopilot-finalize`

Neue Edge Function, die alle fertigen Szenen zu einem Film zusammensetzt:

- Baut ein Universal-Creator-kompatibles Payload (`scenes[].background = { type: 'video', videoUrl }`, `useAnimation`), strikt mit `rawMediaMode: true` — die Raw-Media-Invariante gilt auch hier, keine Cinematic-Filter außerhalb Director's Cut.
- Legt Logo-/Produkt-Overlays aus `autopilot_assets` (Rolle „Logo"/„Produkt", Overlay-Variante) auf die geplanten Szenen.
- Startet den Render über `render-with-remotion` per Service-Role mit `userId` im Body (dieser Pfad ist dort vorhanden, kein User-JWT nötig — löst das Token-Ablauf-Problem bei langen Läufen).
- Pollt `video_renders` auf das Ergebnis und schreibt `final_video_url` in `autopilot_productions`; danach Ablage in der Mediathek nach der bestehenden Persistenz-Regel (Videos → `video_creations`).

### 5. UI

- `ProductionStage.tsx` bekommt die neuen Phasen: Ton → Lip-Sync → Endschnitt → fertig, jeweils mit Live-Log und Fehlerzustand pro Szene.
- `DirectorsTable.tsx` bekommt vor dem Start einen Freigabedialog mit der konkreten Credit-Summe (Aufschlüsselung pro Stufe) und Bestätigung.
- Am Ende: Player mit dem fertigen Film, Download und „In Director's Cut öffnen" für Feinschliff.

### Technische Details

- Migration ergänzt `autopilot_productions` um `voiceover_url`, `music_url`, `audio_mix jsonb`, `render_id`, `spent_credits`, und `autopilot_production_scenes` um `voiceover_url`, `voiceover_duration_seconds`, `lipsync_url`, `spent_credits`, `refunded` — inklusive GRANTs und RLS analog zu den bestehenden Autopilot-Tabellen.
- `deduct_ai_video_credits` schreibt die Transaktion selbst; der Helper ergänzt Idempotenz-Prüfung und erstattet über einen `refund`-Eintrag.
- Szenenlängen rasten weiterhin auf das Hailuo-Raster (6s/10s) ein; der Endschnitt gleicht die Abweichung über Szenen-Trims im Remotion-Payload aus, damit die Gesamtdauer der geplanten Länge entspricht (max. 180s).
- Lange Läufe: Orchestrator arbeitet weiter szenenweise und schreibt Zwischenstände in die DB, damit ein Funktionstimeout keine Produktion verliert.

### Nicht in diesem Schritt

- Separate Foley-Einzelspuren und automatische Farbkorrektur.
- Parallelisierung der Motion-Generierung (bleibt sequentiell).
