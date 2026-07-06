# Fix + Optimierung: Preclip-Pipeline für Multi-Sprecher

Zwei Phasen, sauber getrennt. **Phase 1** stoppt sofort das Bluten (deploybar in 5 min, ~20 Zeilen). **Phase 2** halbiert die durchschnittliche Wall-Clock strukturell (~80 Zeilen, ein Refactor in `pass-face-preclip.ts`).

---

## Phase 1 — Sofortfix (Symptom)

Behebt den akuten `v187_preclip_required_no_fullplate_fallback`-Abbruch. Alles minimal, kein Architektur-Umbau.

### 1.1 Poll-Timeout auf 300 s

Datei: `supabase/functions/compose-dialog-segments/index.ts`

- Zeile **4288**: `180_000` → `300_000`
- Zeile **6610**: `120_000` → `300_000`

Deckt P99 der aktuell gemessenen Preclip-Dauern (max 191 s) mit ~50 % Marge, bleibt weit unter dem 600 s-Edge-Function-Timeout.

### 1.2 Reuse-Guard für fertige Renders

Datei: `supabase/functions/_shared/pass-face-preclip.ts`

Vor dem `INSERT INTO video_renders` (Zeile 200) einfügen: Look-up auf einen bereits `completed` Render für dieselbe `composer_scene_id` + `pass_idx` innerhalb der letzten 15 Min. Wenn gefunden → sofort zurückgeben, kein zweiter Lambda-Call.

```ts
const { data: prior } = await supabase
  .from("video_renders")
  .select("render_id, video_url, content_config")
  .eq("source", "dialog-pass-preclip")
  .eq("status", "completed")
  .contains("content_config", { composer_scene_id: sceneId, pass_idx: passIdx })
  .gte("started_at", new Date(Date.now() - 15 * 60_000).toISOString())
  .order("started_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (prior?.video_url) {
  return { ok: true, preclipUrl: prior.video_url, preclipRenderId: prior.render_id,
           crop, durationSec: dur, fps: FPS, frameCount: durationInFrames };
}
```

**Sicherheit:** die Cache-Bedingung enthält `pass_idx` — ein Retry mit anderer `preclip_crop`-Geometrie (z. B. v116 Face-Gate-Repair mit `cropExpansionFactor > 1`) legt ohnehin einen neuen Datensatz an. Wir hängen den `cropExpansionFactor` zusätzlich in den Match ein:

```ts
.contains("content_config", { composer_scene_id: sceneId, pass_idx: passIdx,
                              face_crop: { size: crop.size } })
```

Damit trifft der Cache nur bei geometrisch identischem Preclip.

### 1.3 Poll-Intervall halbieren

Datei: `supabase/functions/_shared/pass-face-preclip.ts`

- Zeile **91**: `POLL_INTERVAL_MS = 2_000` → `1_000`

Spart im Mittel ~1 s pro Preclip Detection-Latenz. Trivial, kein Kosten-Impact.

**Was Phase 1 nicht anfasst:** Sync.so-Payload, Retry-Ladder, v183 Silent-Faces, v187 Hard-Fail-Policy, Refund-Logik, `finalize-dialog-scene`, Master-Plate-Rendering.

---

## Phase 2 — Strukturelle Beschleunigung (Ursache)

Reduziert P50 Preclip-Dauer von ~70 s auf **~30–40 s** und P99 von ~200 s auf **~90 s**. Getrennt deploybar nach Phase 1.

### Root Cause Recap

Aktuell rendert jedes Preclip auf **1 Lambda-Instanz** mit **`concurrencyPerLambda: 1`** → serielle Frame-Berechnung. Bei einem 6 s-Fenster @ 30 fps = 180 Frames, die einzeln durch Chromium laufen. Plus voller Download der Masterplate pro Lambda.

### 2.1 Native Lambda-Parallelisierung aktivieren

Datei: `supabase/functions/_shared/pass-face-preclip.ts`, `lambdaPayload` (ab Zeile 228)

Zwei zusätzliche Felder in den Payload:

```ts
framesPerLambda: 60,     // splittet 180 Frames → 3 Lambdas parallel
concurrencyPerLambda: 1, // bleibt, wegen Speicher-Safety
```

Remotion Lambda spinnt automatisch mehrere Renderer parallel und stitcht am Ende. Der Master-Plate-Download passiert einmal pro Lambda, aber die Frame-Arbeit läuft echt parallel. Erwartete P50-Halbierung.

**Concurrency-Policy-Check:** aktuelle Policy ([Lambda Concurrency Policy](mem://infrastructure/aws-lambda/rendering-concurrency-stability-policy)) sagt "max 3 parallele Worker pro Render, framesPerLambda 270". Preclips sind aber ≤ 180 Frames — `framesPerLambda: 60` gibt max 3 Worker → passt in die Policy.

### 2.2 Preclip-Cache auf Content-Key normalisieren

Neue Cache-Schicht in `pass-face-preclip.ts`: identische `(masterVideoUrl, coords, startSec, endSec, expandFactor)` treffen einen 24 h-Cache. Nutzt bestehende Tabelle `render_asset_cache` (existiert bereits, siehe Table-List) oder legt einen einfachen Deno-Memo-Cache pro Request an.

Vorteil: v129 Retry-Ladder rendert oft denselben Preclip mit denselben Coords erneut — heute → neuer Lambda-Call, mit Cache → 0 s.

### 2.3 Diagnose-Log für Phasen-Aufteilung

Ein einziger `console.log` mit `dispatch_ms / poll_wait_ms / total_ms` pro Preclip, damit wir nach Phase 2 messen können, welcher Anteil (Cold-Start vs. Rendering vs. Poll-Latenz) noch dominiert. Kein Verhalten, nur Sichtbarkeit.

---

## Was bewusst NICHT in diesem Plan ist

- **Server-seitiges ffmpeg-Pre-Trim** (Deno-Edge hat kein natives ffmpeg; WASM ist bei 720p langsamer als Lambda selbst; eine separate Trim-Lambda wäre ein neues Deploy-Ziel — Overkill für den Nutzen).
- **Preclip-Auflösung senken** (720p-Floor ist von Sync.so [Docs](https://sync.so/docs) vorgegeben, siehe Kommentar bei Zeile 168).
- **Sync.so-Payload-Änderungen** — orthogonal zum Timeout-Problem.
- **v183 Silent-Faces / Remotion-Bundle-Redeploy** — bleibt separater Track (AWS-Credentials nötig).

---

## Rollout-Reihenfolge

1. Phase 1 committen + deployen → User startet die fehlgeschlagene S01-Szene neu → sollte durchlaufen.
2. 1–2 Tage Preclip-Dauern beobachten (`syncso_dispatch_log` + `video_renders`).
3. Wenn stabil: Phase 2 nachschieben. Optional Rollback: `framesPerLambda`-Zeile entfernen, alles andere bleibt.

## Betroffene Dateien

| Datei | Phase 1 | Phase 2 |
|---|---|---|
| `supabase/functions/compose-dialog-segments/index.ts` | 2 Zahlen | — |
| `supabase/functions/_shared/pass-face-preclip.ts` | ~15 Zeilen Reuse-Guard + 1 Konstante | +2 Payload-Felder, +Cache-Lookup (~40 Zeilen), +1 Log |

Beide Phasen sind rein additiv / parametrisch — keine Schema-Änderung, keine API-Contract-Änderung, kein Sync.so-Impact, kein Refund-Logik-Impact.
