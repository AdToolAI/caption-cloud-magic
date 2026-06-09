## Ziel

Zwei Probleme adressieren, ohne die mühsam gehärtete Pipeline (v60 Serial-Chain, v69 Preclip, v82 bbox-url, v88 Edge-Skip, v89 TTS-Trim, v90 Aliasing-Fix) zu zerschießen:

1. **Lip-Sync greift aktuell nur bei Speaker 1+2** (4-Speaker-Szene). Nach v90 (Tail-Clamp 0.08→0.02s + per-turn offsets).
2. **Pipeline ist gefühlt sehr langsam** — wo lässt sich gefahrlos Zeit sparen?

---

## Teil A — Lip-Sync nur bei Speaker 1+2: Diagnose-First, dann gezielter Fix

### Verdachtsmomente (in Reihenfolge)

1. **v90 Tail-Clamp zu aggressiv für kurze Turns von Speaker 3/4.**  
   Wenn Speaker 3 oder 4 nur kurz spricht (z. B. 0.6 s), wird das slice-Window nach `SEG_PAD_END=0.02s` extrem knapp. `normalizeWav` paddet zwar auf ≥3 s — aber Sync.so erkennt dann u. U. „kein Sprachsignal" und gibt `provider_unknown_error` zurück. Das würde die Retry-Ladder triggern, die für N≥3 oft in `coords-pro` landet und dort am 3+ Speaker Repair-Audio-Guard hängenbleibt (siehe v82-Notiz).
2. **Per-turn `output_offsets_sec` greift nur bei Multi-Turn.**  
   Bei 4 Sprechern mit je einem Turn ist `outputOffsets[0]=0` korrekt — also kein Mux-Problem. Aber Speaker 3/4 könnten in einer eigenen Pass-Webhook-Kette hängen (v60 serial chain), während Pass 1/2 schon geliefert haben. Aktuelle UI zeigt „nur 1+2 funktionieren", weil 3/4 noch `pending` oder bereits `failed` sind.
3. **Watchdog Recovery wird vom Ghost-State blockiert** (siehe Sub-Agent-Befund: `hasRecordedProviderJobLocal` returns true, weil Pass 1/2 erfolgreich Job-IDs haben → Watchdog überspringt Pass 3/4 Re-Dispatch).

### Diagnose-Schritte (read-only, bevor wir Code anfassen)

1. SQL: `SELECT scene_id, turn_idx, attempt, sync_status, error_class, error_message, audio_dur_sec, created_at FROM syncso_dispatch_log WHERE scene_id = '<aktuelle szene>' ORDER BY turn_idx, attempt, created_at` — zeigt klar, ob Pass 3/4 überhaupt dispatcht wurde und wo er ausstieg.
2. `dialog_shots.passes[2..3]` der betroffenen Szene inspizieren: `status`, `job_id`, `output_url`, `audio_tight.dur_sec`, `error_message`.
3. Edge-Function-Logs `sync-so-webhook` und `compose-dialog-segments` nach der `scene_id` filtern.

### Geplante Fixes (nach Diagnose, sehr chirurgisch)

A1. **Tail-Clamp verträglicher machen für kurze Turns**: Statt fest `SEG_PAD_END=0.02s` einen dynamischen Floor — Window-Dauer muss nach Padding ≥ 0.30 s sein. Sonst auf `SEG_PAD_END=0.08` (v89-Wert) zurückfallen. So bleibt der Tail-Twitch-Fix für normale Turns aktiv, kurze Turns von Speaker 3/4 werden aber nicht ausgehungert. (Datei: `compose-dialog-segments/index.ts` Slice-Block + Mux `SHOT_PAD_END` analog.)

A2. **Watchdog-Recovery härten**: `hasRecordedProviderJobLocal` darf eine Pass-Recovery nicht blockieren, wenn *nur ein Teil* der Passes dispatcht wurde. Statt boolean → Set von Pass-Indices; recovery wird pro fehlendem Pass-Index separat ausgelöst. (Datei: `lipsync-watchdog/index.ts`.)

A3. **Pre-Pass-Validierung**: In `compose-dialog-segments` direkt nach `audio_tight` einen Check einbauen — wenn `dur_sec < 0.30s` UND keine `output_offsets_sec`-Diagnose vorliegt → diesen Pass auf `auto-pro` (Full-Plate) statt Preclip routen. So fängt die Ladder Kurz-Turns sauber ab, ohne die Hauptpipeline anzufassen.

A4. **Manueller Recovery-Reset für die aktuelle Szene** (nur die `dialog_shots.passes[2,3]` auf `pending` setzen, `clip_url` behalten, `lip_sync_status='pending'`) damit der Watchdog die fehlenden Pässe sauber neu dispatcht — ohne die bereits gerenderten 1+2 zu zerstören.

---

## Teil B — Pipeline beschleunigen, ohne Qualität zu opfern

Die Pipeline besteht heute pro Multi-Speaker-Szene aus diesen Phasen (vereinfacht):

```text
1. compose-video-clips        ~30–90s  (Nano Banana 2 Anchor + Hailuo i2v Master)
2. compose-twoshot-audio      ~10–20s  (ElevenLabs TTS mit /with-timestamps)
3. Per-Pass Preclip Render    ~5–15s pro Pass × N Speaker  (Remotion Lambda)
4. Sync.so Dispatch SERIELL   ~25–45s pro Pass × N Speaker (v60 serial chain)
5. render-sync-segments-mux   ~15–25s  (Remotion Lambda Mux)
```

Bei N=4 → Phase 3+4 dominieren mit ~3–4 Minuten allein für Lip-Sync.

### Risikofreie / sehr risikoarme Beschleunigungen

B1. **Preclip-Renderings parallel statt seriell** *(nicht zu verwechseln mit Sync.so Serial Chain)*.  
   Aktuell rendert `compose-dialog-segments` die N Preclips nacheinander im selben Edge-Function-Lauf. Lambda-Renders sind unabhängig → `Promise.all` mit Concurrency-Limit 2–3 wäre safe. Spart ~20–40 s bei N=4. **Keine Qualitäts- oder Stabilitätskosten.**

B2. **Anchor-Cache aggressiver nutzen.**  
   `ANCHOR_AUDIT_VERSION=5` bumpt aktuell alle alten Anchor. Wenn User die Szene nur leicht ändert (z. B. Skript-Edit), wird der teure Nano Banana 2 + Identity-Audit unnötig wiederholt. Cache-Key sollte die Szenenbeschreibung + Cast + Outfit-Hash sein — Skripttext darf den Cache nicht invalidieren. Spart ~20–60 s bei Re-Runs. **Keine Qualitätskosten** (Anchor ist visuell identisch).

B3. **TTS und Anchor parallelisieren.**  
   Aktuell läuft `compose-twoshot-audio` strikt nach `compose-video-clips`. Beide haben aber keine harte Datenabhängigkeit voneinander — Skripttext und Voice-IDs sind sofort verfügbar. Trigger beide parallel direkt nach Szenen-Save. Spart 10–20 s pro Szene.

B4. **Sync.so Watchdog-Polling beschleunigen.**  
   `STALE_DISPATCH_RECOVERY_MS=3min` ist großzügig. Reduzieren auf 90 s (Sync.so normale Render ist 25–45 s, doppelte Toleranz reicht). Im Schnitt 60–90 s gespart wenn ein Pass mal zickt.

B5. **Sync.so Webhook statt Polling.**  
   `poll-dialog-shots` läuft per cron alle 60 s. Wenn `sync-so-webhook` schon konfiguriert ist (laut Memory `Sync.so Webhook + 8min Watchdog`): Webhook patcht in ~1 s. Sicherstellen, dass auch die Multi-Pass-Chain den Webhook nutzt und nicht erst auf den Minuten-Poller wartet. Spart bis zu 60 s pro Pass.

### Mittleres Risiko, nur wenn Sub-Agent es freigibt

B6. **Sync.so Multi-Pass PARALLEL statt seriell** (würde v60 antasten — nicht empfohlen ohne Lasttest, weil Sync.so unter Last `provider_unknown_error` häuft).

### Out of scope (Qualitätsrisiko zu hoch)

- Anchor-Audit überspringen, geringere Lambda-Auflösung, Hailuo i2v auf 720p reduzieren, kein Identity-Lock mehr.

---

## Reihenfolge & Deliverables

1. Diagnose-SQL ausführen (Teil A, Schritt 1–3).
2. Auf Basis der Logs: A1 + A2 + A3 implementieren (kleine Edits, ein Edge-Function-Deploy).
3. A4 als einmaliger manueller Reset für die aktuelle Szene.
4. B1 + B2 + B3 + B4 in einem zweiten Commit (alle low-risk, alle einzeln messbar).
5. B5 nur falls Webhook-Pfad für Multi-Pass-Ketten aktuell nicht greift (per Logs prüfen).

Dauer-Erwartung nach B-Fixes: Multi-Speaker-Szene mit N=4 von heute ~4–5 min auf ~2–2.5 min, ohne dass Anchor-Qualität, Lip-Accuracy oder Stabilität sinken.

---

## Bitte um Bestätigung

- **Sollen wir mit der Diagnose-SQL (Teil A.1–A.3) loslegen und dir die Befunde zeigen, bevor wir den Fix-Code schreiben?** Oder direkt die Fixes A1+A2+A3 implementieren und parallel die SQL-Diagnose laufen lassen?
- **Bei den Speedups: B1+B2+B3+B4 in einem Rutsch — oder lieber einzeln, damit du nach jedem Schritt die End-to-End-Zeit messen kannst?**
