## Ergebnis dieser Iteration

Der Single-Charakter-Cinematic-Sync startete nicht sichtbar, weil `compose-video-clips`
die Szene synchron durch Anchor-Komposition + Audits + Provider-Dispatch trieb. Diese
Kette kann pro Szene 30–90s dauern. Der Browser-Client (`supabase-js`) bricht aber
nach ~30s ab, der Ladebalken verschwand, die Szene blieb stehen.

### Fix
- `compose-video-clips`:
  - markiert ALLE AI-Szenen sofort als `clip_status='generating'` in der DB (optimistischer Pre-Mark)
  - returnt sofort `{ success: true, async: true, results }` mit `status='generating'` pro AI-Szene
  - die eigentliche Pro-Szene-Verarbeitung läuft im Hintergrund via `EdgeRuntime.waitUntil`
- HappyHorse Cinematic-Sync ohne Anchor: bleibt als klar formulierter Fehler (`happyhorse_cinematic_sync_missing_anchor`), nicht mehr als stiller 30s-Abbruch
- 2-Charakter-Pipeline bleibt unverändert: Face-/Human-/Identity-Audits laufen weiterhin streng

### Datenreset
- `composer_scenes.id IN (b48e1edf-…, c95a44c4-…)` komplett auf `pending` zurückgesetzt
- `scene_anchor_cache` Einträge für beide Szenen gelöscht

### Effekt
Klick auf „Generieren" → Edge-Function returnt < 3s → UI sieht sofort `clip_status='generating'`
→ Hintergrund-Worker komponiert Anchor + dispatcht Hailuo/HappyHorse → Webhook
markiert `ready` → Auto-Trigger startet Lip-Sync. Keine 30s-Sackgasse mehr.
