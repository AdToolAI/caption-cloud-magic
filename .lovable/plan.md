## v129.6 — Forensik-Bundle Refactor

**Ziel:** Das Forensik-Bundle von "Theater" zu "Diagnose" machen. Aktuell zeigt es SHA256 + Codec-Hints — Daten die uns nichts beantworten. Neu: die drei Felder, aus denen wir den `generation_unknown_error` tatsächlich erklären können.

Strikt Read-Only gegen Produktion: keine Mutation an `composer_scenes`, `dialog_shots`, Wallet, Watchdog. Nur Lese-Zugriffe + ein GET an Sync.so.

---

### Was rausfliegt

Aus `syncso-support-bundle/index.ts`:
- `video.sha256`, `audio.sha256` (irrelevant solange Asset reachable)
- `video.metadata.codec_hint`, generischer `codec`-String
- "Audio Meta / Video Meta" JSON-Blobs in der UI

### Was reinkommt

**1. Provider Truth** (Pflicht — der eigentliche Diagnose-Wert)
- `GET https://api.sync.so/v2/generate/:provider_job_id` mit `x-api-key`
- Response 1:1 ins Bundle unter `provider_truth: {...}`
- Felder die wir in der UI prominent zeigen: `status`, `error_details` (nicht nur `error`!), `model`, `options`, `created_at → updated_at` (Worker-Laufzeit)
- Wenn 404 oder Auth-Fail: `provider_truth: { error: "fetch_failed", status: 404 }` — nicht crashen

**2. Exakter Reproducer-Payload** (Pflicht für sinnvolle Replays)
- Aus `syncso_dispatch_log` (existiert bereits, 31 Spalten) den letzten POST-Body für `provider_job_id` lesen
- Felder: `sync_mode`, `segments`, `model`, `options`, `webhook_url`
- Sanitized (signed URLs werden zu `{signed_url_expired}` ersetzt, nur Pfad bleibt) → als `request_payload: {...}` ins Bundle
- Plus generierter `curl_snippet` zum 1:1 manuellen Reproduzieren

**3. Face-Probe auf Frame 0 des Plates** (Optional, defaultmäßig OFF)
- Toggle "Inkl. Face-Probe (~€0.001)" im Forensik-Sheet
- Ruft bestehende `frame_face_cache`-Logik / Gemini Vision auf Frame 0+30 des `video_url`
- Ergebnis: `face_probe: { frame_0: { faces: 1, bbox: [...] }, frame_30: {...} }`
- Häufigste Ursache von `generation_unknown_error` = 0 oder >1 Gesichter → das beantwortet 50%+ der Fälle sofort

### Bundle-JSON-Schema (neu)

```text
{
  "scene_id": "...",
  "pass_index": 0,
  "provider_job_id": "...",
  "provider_truth": { status, error_details, model, options, worker_ms },
  "request_payload": { sync_mode, segments, model, options },
  "curl_snippet": "curl -X POST ...",
  "asset_reachable": { video: true, audio: true },   // ersetzt SHA256-Block
  "face_probe": null | { frame_0, frame_30 },        // nur wenn Toggle an
  "created_at": "..."
}
```

### UI-Änderungen (`SyncsoForensicsSheet.tsx`)

Bundle-Tab zeigt jetzt vier Sektionen statt der SHA-Blöcke:
1. **Verdict-Banner** (oben, prominent): 
   - Wenn `provider_truth.error_details` Stichwort "face" enthält → gelb "Face-Detection-Fehler — versuche `bboxes`-Preset"
   - Wenn `worker_ms < 2000` → orange "Provider-Side Worker-Crash (instant fail)"
   - Wenn `options.sync_mode` gesetzt → blau "Versuche Replay-Preset `omit_sync_mode`"
   - Sonst grau "Keine eindeutige Ursache — Provider Truth manuell prüfen"
2. **Provider Truth** (raw JSON, collapsed default)
3. **Reproducer** (curl_snippet, copy-button)
4. **Face-Probe** (falls aktiviert)

### Sicherheit / Isolation (unverändert)

- Admin-only via `has_role('admin')` (bereits in v129.5)
- Read-only gegen `composer_scenes` / `dialog_shots` / `syncso_dispatch_log`
- Kein Write außer in `support-bundles` Storage + `syncso_replay_log` (append-only, schon da)
- Kein Wallet-/Watchdog-Touch
- Face-Probe Toggle = explizites Opt-in pro Bundle (Kostenkontrolle)

---

### Geänderte/neue Dateien

- `supabase/functions/syncso-support-bundle/index.ts` — komplett überarbeitet (Sektion "Bundle-JSON-Schema"). SHA256 raus, Provider Truth + dispatch_log Lookup + sanitizer rein. Optionaler `?include_face_probe=1`.
- `src/components/admin/SyncsoForensicsSheet.tsx` — neue Bundle-Render-Sektionen, Verdict-Banner, Face-Probe Toggle
- `docs/lipsync/v129-6-bundle-refactor.md` — kurzes Changelog (was raus, was rein, warum)
- `mem/architecture/lipsync/v1296-bundle-refactor.md` — Memory-Update

**Keine** Migration, **keine** Schema-Änderung, **keine** Touch an Live-Pipeline-Functions.

### Verifikation

1. Forensik-Sheet auf der bekannten Failed-Scene (`85e38890…`, pass 0) öffnen
2. "Bundle erzeugen" → erwartet: Verdict-Banner + Provider Truth JSON + curl_snippet
3. `provider_truth.error_details` notieren → das ist die Antwort die wir die ganze Zeit suchen
4. Optional: Face-Probe einschalten → falls `frame_0.faces ≠ 1` → Ursache gefunden, ohne einen einzigen Replay zu starten

### Bewusst NICHT in diesem Scope

- Keine neuen Replay-Presets (kommt erst nachdem Provider Truth eine Richtung zeigt)
- Keine Heuristik-Engine die automatisch Replays auslöst (Mensch entscheidet)
- Keine Änderung an Produktions-Dispatch / Webhook