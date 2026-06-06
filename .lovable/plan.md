## Was ist passiert (Szene S03 / dcbebf32…)

Edge-Logs zeigen:
```
[compose-clip-webhook] Clip failed: HTTPSConnectionPool(host='lbunafpxuskwmsrraqxl.supabase.co', port=443): Read timed out. (read timeout=10)
[compose-clip-webhook] Refunded €1.05 (ai-happyhorse/standard)
```

Was wirklich schiefging — drei zusammenhängende Bugs:

### Bug 1 — Replicate-Read-Timeout beim Laden der Reference-Image
HappyHorse (`ai-happyhorse`) ist auf Replicate gestartet und wollte die Scene-Anchor-PNG aus unserem `composer-frames` Bucket laden. Replicate hat ein 10 s read-timeout — und unser Bucket liefert die Datei mit `cache-control: no-cache` + `cf-cache-status: MISS` aus, also geht jeder Fetch zum Origin. Bei 1.79 MB + Origin-Latenz kippt das gelegentlich um. Ergebnis: Replicate killed die Prediction sofort als "failed", wir bekommen Webhook → Szene tot.

Das ist **kein** Bug in unserer HappyHorse-Integration und auch **kein** Bug im Prompt — das Bild ist erreichbar (HTTP 200, 1.79 MB), aber unter Last unzuverlässig genug, dass Replicate vor 10 s aufgibt.

### Bug 2 — Falscher Refund-Betrag
`CLIP_COSTS` in `compose-clip-webhook` listet `ai-happyhorse` nicht (auch nicht `ai-pika`, `ai-runway`, `ai-vidu`, `ai-grok`, `ai-ltx`). Fallback ist 0.15 €/s → 7 s × 0.15 = **€1.05 refunded statt €1.96** (HappyHorse 720p = €0.28/s lt. Memory). User wurde um 0.91 € geprellt.

### Bug 3 — Kein Auto-Retry
Bei einem reinen Provider-Side-Timeout (kein Content-Fehler) sollten wir genau **einen** stillen Retry fahren, bevor die Szene endgültig als "Fehler" angezeigt wird. Aktuell: 1× failed → Szene tot, User muss manuell neu generieren.

---

## Fix-Plan

### 1. `supabase/functions/compose-clip-webhook/index.ts`
- **CLIP_COSTS vervollständigen** — alle Composer-Provider eintragen (synchron mit `compose-video-clips`): `ai-happyhorse {0.28, 0.56}`, `ai-pika {0.20, 0.45}`, `ai-runway {0.25, 0.50}`, `ai-vidu {0.18, 0.30}`, `ai-grok {0.20, 0.40}`, `ai-ltx {0.10, 0.18}` (exakte Werte aus `src/config/*VideoCredits.ts` ziehen, nicht raten).
- **Auto-Retry-Branch** im `failed`-Pfad: wenn `predError` einen Read-Timeout / "fetch input"-Fehler enthält **und** `retry_count < 2`, dann *nicht* als failed markieren + refunden, sondern Szene zurück auf `clip_status='pending'` setzen und `compose-video-clips` für genau diese Szene re-dispatchen (gleiches Cost-Deduct entfällt, weil schon abgebucht). Bei "echten" Fehlern (Content-Policy, invalid input, etc.) Pfad unverändert.

### 2. `composer-frames` Storage Bucket
Cache-Control auf `public, max-age=3600, immutable` setzen für hochgeladene Scene-Anchors (in `compose-scene-anchor` beim Upload). Das löst die Root-Cause: Replicate fetcht beim Retry aus dem Cloudflare-Cache statt Origin → kein Timeout mehr.

### 3. Memory
Neue Notiz `mem://architecture/video-composer/replicate-fetch-timeout-resilience.md` (1.+2. dokumentieren), Index-Eintrag.

### Out of Scope
- Keine Änderung am Lipsync-Pfad (v60–v64 unverändert).
- Keine Provider-Logik / Prompt-Änderung.
- Keine UI-Änderung am Composer.

### Verifikation
- Test-Szene mit HappyHorse generieren → erfolgreich.
- Künstlich gepatchten Timeout reproduzieren → Logs zeigen `[compose-clip-webhook] auto-retry 1/2 for scene …` und neuen Replicate-Dispatch; Szene endet als `done`.
- Refund-Log bei echtem Fail: `Refunded €1.96 (ai-happyhorse/standard)`.
