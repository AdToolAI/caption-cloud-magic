## Was die Diagnose wirklich zeigt

Ich habe den Edge-Function-Fehler reproduziert und gleichzeitig deine Beobachtung ausgewertet — **beides zusammen ist der Schlüssel**:

### 1. Warum die Forensik 500 wirft
`lipsync-diagnostic` versucht in `mode="plate-face-forensic"` Replikate per **rohem `REPLICATE_API_TOKEN`** (Env-Var) zu instanziieren. Dieses Secret existiert in unserem Projekt nicht — wir nutzen den **Lovable Connector-Gateway** mit `LOVABLE_API_KEY` + `LOVABLE_CONNECTOR_REPLICATE_API_KEY`. Curl-Reproduktion liefert exakt:
```
500 {"error":"REPLICATE_API_TOKEN missing"}
```

### 2. Was dein Lipsync-Diagnostic-Run uns sagt (viel wichtiger!)
Du hast denselben Plate (`p1-preclip-f891d02f039ac730.mp4`, 4 Sprecher) im **Standard-Diagnostic** durchgejagt. Run `32530f41` ist auf `completed`, Variante **A · sync-3 auto_detect** und **E · lipsync-2-pro** zeigen einen **sichtbar lippensynchronen Sarah-Mund**. Das heißt **eindeutig**:

> **Der Plate hat ein erkennbares, lipsync-fähiges Gesicht.** Hailuo ist NICHT der Schuldige.

Die `face_gate_failed:count=0`-Fehler in Produktion entstehen also nicht durch fehlende Gesichter, sondern durch **Sync.so's Server-Face-Probe / `auto_detect` im Multi-Speaker-Pfad** — derselbe Provider, der bei einem isolierten Test mit identischem Asset problemlos lipsynct, scheitert in der vollen 4-Speaker-Pipeline mit `active_speaker_detection.mode=auto_detect`.

Das deckt sich mit dem Memory **"Sync-3 Doc-Strict Options (v106)"**: Multi-Speaker braucht **deterministische ASD** (bbox-url oder frame+coords) — `auto_detect: true` ist bei ≥2 Sprechern unzuverlässig.

---

## Plan v146 (2 Teile)

### Teil A — Forensik-500 fixen (klein, isoliert)
**Datei:** `supabase/functions/lipsync-diagnostic/index.ts`

1. `runForensic` baut Replicate-Client über Connector-Gateway statt rohem Token:
   ```ts
   const replicate = new Replicate({
     auth: LOVABLE_API_KEY,
     baseUrl: "https://connector-gateway.lovable.dev/replicate/v1",
     fetch: (input, init) => fetch(input, {
       ...init,
       headers: { ...(init?.headers ?? {}), "X-Connection-Api-Key": Deno.env.get("LOVABLE_CONNECTOR_REPLICATE_API_KEY")! },
     }),
   });
   ```
2. Pre-Check ersetzt: statt `REPLICATE_API_TOKEN missing` jetzt `LOVABLE_CONNECTOR_REPLICATE_API_KEY missing`.
3. Version-Bump `LIPSYNC_DIAGNOSTIC_VERSION = "v146.0"`.

→ Damit läuft die Forensik durch. Ergebnis wird zur Bestätigung dienen (wir erwarten `verdict=plate_face_count_ok` für 1–2 sichtbare frontale Gesichter, evtl. `_low` weil 4 Speaker im Wide-Shot, aber **mindestens 1**).

### Teil B — Eigentlicher Production-Fix: Sync.so ASD deterministisch erzwingen
Da der Plate beweisbar lipsync-fähig ist, gehört der Fix in den Production-Dispatch — **NICHT** in eine Hailuo-Prompt-Tuning-Schleife.

**Datei:** `supabase/functions/compose-dialog-segments/index.ts`

1. In der Variant-Auswahl für `speakers >= 2`: erste Ladder-Stufe ist **nicht mehr** `coords-pro` mit `auto_detect`, sondern **`bbox-url-pro`** (deterministische bounding_boxes_url). Wir haben die bboxes ja aus dem v131-Preclip schon berechnet (`bbox_count > 0` Probe).
2. Wenn `bbox_count == 0` (echter Worst-Case → wirklich kein Gesicht im Crop): einmaliger Fallback auf `coords-pro` mit ASD-coords aus Preclip, danach **fail-fast + Auto-Refund** (statt 4 NOOP-Repair-Loops, die wir schon mit v144 entschärft hatten).
3. `_v102_probe` / `_v105_probe` loggen `asd_mode_chosen` und `bbox_count_at_dispatch`, damit wir das Ergebnis sofort auf `/admin/lipsync-diag` sehen.
4. Version-Bump `COMPOSE_DIALOG_SEGMENTS_VERSION = "v146.0"`.

### Teil C — UI-Hinweis (kosmetisch, 3 Zeilen)
`LipsyncDiagnostic.tsx`: Forensik-Karte zeigt unter dem Result einen Verdict-Hinweis-Block: bei `_ok` mit Verweis "→ Sync.so ASD-Modus prüfen, nicht Hailuo".

---

## Was NICHT geändert wird
- Kein Eingriff in `rehostPlate` (v143 läuft sauber, HTTP 201).
- Kein Hailuo-Prompt-Tuning für `speakers>=3` (war im alten v145-Plan vorgesehen — **gestrichen**, da Plate beweisbar OK).
- Kein NOOP-Retry-Loop-Touch (v144 hält).
- Kein Schema-Change.

## Verifikation nach Deploy
1. Forensik-Run mit deinem Plate → `completed` mit Frame-Bildern + Gemini-Counts.
2. Szene `8bd0d568…` im Composer re-triggern → erwartet `asd_mode_chosen=bbox-url-pro`, `bbox_count_at_dispatch>0`, kein `face_gate_failed`.
3. Falls Sarah-Turn immer noch failt: Logs zeigen jetzt **deterministisch**, ob es an Coords liegt (→ Sync.so-Bug, support ticket) oder an einer echten Plate-Lücke (→ erst dann Hailuo-Tuning).