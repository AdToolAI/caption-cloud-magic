## Was passiert gerade

Logs für die fehlgeschlagene 3-Sprecher-Szene `afbfd804…`:

```
faceMap=cache faces=3 anchor=1376x768 plate=probe-failed speakers=3
coords=[[316,159],[640,159],[961,159]] sources=["identity","identity","identity"]
DISPATCH pass=1/3 … coords=[316,159] sync_mode=cut_off model=lipsync-2-pro
terminal=FAILED extractedErr="An unknown error occurred."
multi-speaker (3 passes) — blocking auto-* fallback (from=coords-pro blocked=auto-pro); marking exhausted
ReferenceError: retryCount is not defined  (sync-so-webhook:624)
```

Drei verzahnte Probleme — alle nur im **≥3-Sprecher**-Pfad relevant:

1. **`plate=probe-failed`** — `probeMp4Dims` liest 0–768 KiB Range vom Hailuo-Plate-MP4. Bei Hailuo-Renderern liegt die `moov`-Box am Dateiende, also findet der ISO-BMFF-Walker keine `tkhd` und gibt `null` zurück. Folge: Wir senden Anchor-Pixel (1376×768, y=159 = obere 20 %) als Roh-Koordinaten an Sync.so, obwohl das Plate eine andere Auflösung/Crop hat → Sync.so findet kein Gesicht und antwortet mit dem opaken `"An unknown error occurred."`.
2. **Multi-Speaker Hard-Block** — Sicherheitsleiter blockt ab 2 Sprechern die `auto-*`-Fallbacks komplett. Bei 3 Sprechern bedeutet das: sobald `coords-pro` einmal an (1) scheitert, gibt es keinen Plan B → ganze Szene `failed`.
3. **`ReferenceError: retryCount is not defined`** in `sync-so-webhook` Zeile 698 — kosmetischer Bug im finalen `console.warn` (Variable existiert nie in v5-Scope), wirft *nach* dem DB-Failed-Update und bricht die HTTP-Antwort an Sync.so ab.

## Leitplanke: 1- und 2-Sprecher-Pipeline bleibt unberührt

Alle Änderungen werden so geschnitten, dass **Single- und Two-Shot-Szenen exakt dieselben Inputs und exakt dieselbe Sicherheitsleiter wie heute sehen**:

- **probeMp4Dims-Tail-Fetch (Punkt 1):** rein zusätzlich. Phase A bleibt 1:1. Tail-Phase B greift nur, wenn Phase A `null` zurückgibt. Wenn die Probe weiterhin scheitert, ist das Verhalten identisch mit heute (Fallback auf `videoDims` aus prevState / Default 1280×720) — also kein Regressionsrisiko für 1/2-Sprecher.
- **Coord-Clamp (Punkt 2):** Clamp ist Identitätsoperation, solange Coords innerhalb des Plates liegen. Bei 1/2-Sprecher liegen die Identity-Match-Coords immer im Bild → der Clamp hat null Effekt. Wird nur dann aktiv, wenn das anchor→plate-Rescaling Coords aus dem Bild schiebt — was praktisch nur bei stark abweichenden Anchor/Plate-Aspect-Ratios bei Wide-Group-Shots (=3+ Köpfe) vorkommt.
- **Sicherheitsleiter (Punkt 3) — explizit gated auf `speakers >= 3`:** der bestehende Block `if (isMultiSpeaker && nextVariant === "auto-*")` wird verschärft auf `if (passesArr.length >= 3 && …)`. Damit:
  - 1 Speaker: ladder `coords-pro → auto-pro → auto-standard` bleibt **unverändert**.
  - 2 Speaker: ladder bleibt **unverändert** (heute fällt sie auch durch — der bestehende Multi-Speaker-Hard-Block in Stage E.5 war ein Overreach von der letzten Iteration, der 2-Shot Lipsync ebenfalls killt, sobald coords-pro mal nicht zündet).
  - 3+ Speaker: bekommt den neuen kontrollierten Last-Ditch-Lite (nur wenn **alle** Passes scheitern → 1 letzter `auto-pro`-Versuch für Pass 1, statt komplett tot).
- **`retryCount`-Fix (Punkt 4):** rein kosmetisch, betrifft nur die console.warn-Zeile im Failure-Branch. Verhalten für alle Speaker-Counts identisch.

Sanity-Check vor Merge: `compose-twoshot-lipsync` (legacy v4, 2-Speaker-Pfad) wird **nicht angefasst**.

## Fix im Detail

### 1) `probeMp4Dims` (`supabase/functions/_shared/twoshot-face-map.ts`)

Zwei-Phasen-Probe:
- Phase A: bestehender Head-Range `bytes=0-786431`. Wenn `tkhd` gefunden → return (= heutiges Verhalten, keine Änderung).
- Phase B (neu): Falls Phase A `null`, Tail-Range `bytes=-524288` (letzte 512 KiB) holen und auf diesem Buffer denselben Box-Walker laufen lassen. Deckt Hailuo/Replicate-MP4s mit hinterem `moov` ab.
- Log: `[twoshot-face-map] probe-result url=… phaseA=… phaseB=… dims=…`.

### 2) Coords-Skalierung anchor-space → plate-space (`compose-dialog-segments`)

Ist bereits implementiert, greift aber nicht, solange `plateDims=null`. Nach (1) liefert die Probe zuverlässig Plate-Dims, also rescalen wir `(x_anchor/anchor_w)*plate_w`, analog y. Log: `coordSpace=anchor→plate scale=W×H` pro Pass.

Clamp: Wenn Coords nach Rescale außerhalb `[0..plate_w] × [0..plate_h]` landen, auf innere 90 %-Box (5 %-Rand) clampen. Greift praktisch nur bei 3+ Sprechern in Group-Shots mit abweichendem Aspect.

### 3) Sicherheits-Leiter softer (`sync-so-webhook`)

Aktuell:
```ts
const isMultiSpeaker = passesArr.length >= 2;
if (isMultiSpeaker && (nextVariant === "auto-pro" || nextVariant === "auto-standard")) {
  nextVariant = null;
}
```

Neu:
```ts
const speakerCount = passesArr.length;
// 1 + 2 Speaker: ladder unverändert (coords-pro → auto-pro → auto-standard).
// 3+ Speaker: blocken, ABER einen Last-Ditch-Lite-Versuch auf Pass 1 erlauben,
//             wenn alle Passes bisher mit kein-Gesicht-Klasse gescheitert sind.
if (speakerCount >= 3 && (nextVariant === "auto-pro" || nextVariant === "auto-standard")) {
  const allPassesFailedNoFace = passesArr.every(
    (p) => p.status === "failed" && /provider_unknown_error|face_not_found/.test(p.last_error_class ?? ""),
  );
  const isFirstPass = currentPass === 0;
  if (!(allPassesFailedNoFace && isFirstPass && nextVariant === "auto-pro")) {
    nextVariant = null;
  }
}
```

→ 1- und 2-Speaker-Verhalten exakt wie vor dieser PR (kein Hard-Block mehr für 2-Shot, der war versehentlich zu scharf).

### 4) `ReferenceError: retryCount is not defined`

Zeile 698 `retries=${retryCount}` → `retries=${passRetryCount}/${aggregateRetryCount}`. Beendet die ERROR-Spam-Zeilen, Sync.so kriegt eine saubere 200.

### 5) Recovery

Migration: betroffene Szene `afbfd804-0b01-4557-bba2-3ac4e2b7a1a0` auf `pending` / `lip_sync_status=NULL` zurücksetzen (Wallet ist refundiert). User klickt „Lip-Sync neu rendern".

## Files

- `supabase/functions/_shared/twoshot-face-map.ts` — Tail-Range-Probe + Log
- `supabase/functions/compose-dialog-segments/index.ts` — Coord-Clamp + Log
- `supabase/functions/sync-so-webhook/index.ts` — `retryCount`-Fix + Gate auf `speakers>=3`
- `compose-twoshot-lipsync/*` — **bewusst nicht angefasst**
- Migration: Reset der betroffenen Szene auf `pending`
- `mem/architecture/lipsync/sync-so-webhook-stage5` — kurzer Hinweis: 1+2 Speaker ladder unverändert, 3+ Speaker mit Last-Ditch-Lite

## Verifikation nach Deploy

- 1 Sprecher: bestehende Test-Szene → Pipeline läuft wie heute, gleiche DISPATCH-Logs.
- 2 Sprecher: bestehende Test-Szene → kein Hard-Block mehr in Logs, ladder läuft komplett durch.
- 3 Sprecher: `afbfd804…` neu rendern → Logs zeigen `probe-result … dims=…x…`, `coordSpace=anchor→plate`, coords-pro Pass 1/2/3 dispatched, im Worst-Case ein einzelner `auto-pro`-Last-Ditch statt Hard-Fail.
