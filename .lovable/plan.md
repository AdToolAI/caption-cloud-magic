## Wave B2 Expansion — Coverage 75 → 200

**Ziel:** Smoke-Coverage von aktuell **75/473** auf **200/473** erweitern, in 5 Patch-Batches à ~25 Funktionen, alle nach demselben bewährten Schema (`isQaMockRequest` Early-Return + `qaMockJson` Sample-Response, kein Provider-Call).

### Batch-Plan (125 neue Funktionen)

| Batch | Kategorie im Cockpit | Funktionen (Beispiele) | Count |
|---|---|---|---|
| **B2.2** | Audio / VO / TTS | `generate-voice-*`, `synthesize-*`, `tts-*`, `elevenlabs-*`, `compose-twoshot-audio`, `extract-subtitle-keywords-*` Varianten | 25 |
| **B2.3** | Music / SFX | `generate-music-*` (Stable Audio, MiniMax), `search-sfx`, `search-music`, `pixabay-*`, `freesound-*` | 25 |
| **B2.4** | Composer / Scene-Pipeline | `compose-scene-anchor`, `compose-dialog-scene`, `scene-director`, `generate-scene-still`, `apply-scene-assets`, `poll-dialog-shots` | 25 |
| **B2.5** | Avatars / Brand / Library | `generate-avatar-portrait`, `seed-preset-avatars`, `clone-preset-avatar`, `wardrobe-*`, `pose-*`, `location-vibe-*`, `brand-character-*` | 25 |
| **B2.6** | Social / Publishing | `publish-*` (Meta, TikTok, X, LinkedIn, YouTube), `schedule-*`, `analytics-*` Wrapper, `oauth-*` Callbacks (read-only) | 25 |

### Vorgehen pro Batch

1. **Bulk-Patch** via Python-Helper (`/tmp/patch_b2_v2.py`, brace-balanced) — fügt `isQaMockRequest` + `qaMockJson(...)` direkt nach CORS-Block ein.
2. **Sample-Assets** je Kategorie wiederverwenden:
   - Audio/Music: bestehende Sample-MP3 aus `_shared/qaMock.ts`
   - Composer/Scene: Sample-Image + Sample-Video URLs
   - Social: `{ ok: true, post_id: 'qa_mock_post' }`
3. **`smokeRegistry.ts`** erweitern (25 neue Einträge pro Batch in passenden Kategorien).
4. **Deploy** der gepatchten Functions in einem Rutsch.
5. **User-Test:** Du klickst im QA-Cockpit die jeweilige Kategorie an → grün → nächster Batch.

### Sicherheits-Regeln (unverändert)

- Kein Provider-Call (Replicate/Hedra/Sync.so/Pixabay/Meta) bei `x-qa-mock: true`.
- Auth/JWT-Checks bleiben — aber **nach** dem Mock-Guard (Lesson aus Wave A).
- Throttling im Runner (400ms Stagger, Batch 6) bleibt aktiv → keine 429er erwartet.
- Keine Änderung an Production-Pfaden, Lip-Sync-Pipeline, Credit-Refund-Logik.

### Was NICHT in dieser Welle ist

- **Cron-/Admin-Functions** (Wave B5) — brauchen Service-Role-Mock, separat
- **AI-Gateway-Wrapper** (Wave B6) — brauchen Token-Mock, separat
- **Render-Stitch / Lambda-Trigger** — bleiben in Deep-Sweep (echte Calls)

### Ergebnis nach Welle

- Coverage: **75 → 200 / 473** (42 %)
- Alle 5 neuen Kategorien einzeln durchklickbar im Cockpit
- Nach grünem Run von allen 5 → Freigabe für **Wave B3** (weitere 125)

Soll ich mit **B2.2 (Audio/VO/TTS)** starten?
