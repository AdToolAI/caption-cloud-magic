## Was die Forensik zeigt

Screenshot: **scene 48b812f7… · pass 0 · 1 Sprecherin (Sarah)**
- Preflight `v129.19` läuft, aber muss auf **plate** zurückfallen (`source=plate · frame=33 · coord=[204,171]`), weil der Dispatch nie ausgegangen ist (Face-Gate hat geblockt → kein `meta.payload_summary.input_video`, kein `outbound_payload`).
- Gesicht-am-ASD-Frame = **FAIL · yes_but_not_at_coord** auf dem Plate-Bild. Die Frau ist klar im Bild, sitzt aber nicht bei `[204,171]`.

→ Das ist **kein Provider-Bug**. Wir haben den echten Crop-Fehler in der Hand: die Koordinate, die wir an Sync.so schicken würden, **trifft das Gesicht nicht**.

## Wo `[204,171]` herkommt

`compose-dialog-segments` rechnet Speaker-Koordinaten so:

1. **`pickSpeakerCoordinates(...)`** — Anchor-Rescale: nimmt die im Charakter-Portrait erkannte Face-Position und skaliert sie linear auf die Plate-Dimensionen. Das ist die Quelle für `[204,171]` bei 1-Sprecher-Szenen.
2. **`resolvePlateFaceIdentities(...)`** — echte Gemini-Vision-Detection auf der Plate — wird heute **nur ab `speakers.length >= 2`** ausgeführt (Zeile 1169).

Für 1-Speaker-Szenen vertrauen wir blind dem Anchor-Rescale. Hailuo rendert die Person aber typischerweise an einer anderen Stelle als das Portrait → die Koord landet neben dem Gesicht (genau das, was Sync.so dann mit `provider_unknown_error` quittiert hätte und was unser neuer Face-Gate korrekterweise vorab blockt).

## Plan v129.20

### A) Plate-Face-Detection auch für 1 Sprecher

`supabase/functions/compose-dialog-segments/index.ts` (~Zeile 1169):

- Bedingung `speakers.length >= 2` → `speakers.length >= 1` ändern.
- Wenn genau 1 Face auf der Plate gefunden wird, dieses Face immer dem einzigen Speaker zuweisen (egal ob Identity-Match klappt — `unlabeled[0]`-Fallback existiert bereits).
- Wenn 0 Faces auf der Plate (Hailuo hat das Gesicht verschluckt) → harter Refund mit `clip_error = "plate_face_missing_single_speaker"` + UI-Hinweis "Bitte Plate neu rendern".
- Wenn >1 Face bei 1 Speaker (z.B. Spiegelung) → größte Bbox gewinnt.

Effekt: bei 1-Sprecher kommt jetzt **dieselbe geprüfte Plate-Pixel-Koord** raus wie bei 2+ — der Face-Gate wird grün, der Dispatch geht raus, und der Preflight-Sheet zeigt nach dem Send `source=preclip · frame=1 · coord=[…]`.

### B) Preflight muss roten Status zeigen wenn Daten fehlen

`supabase/functions/syncso-preflight/index.ts` (~Zeile 441):

- Heute fällt Preflight stillschweigend auf Plate zurück und kann dann sogar grün werden → irreführend.
- Wenn `meta.payload_summary.input_video` fehlt **und** der zugehörige Pass-Status `failed`/`face_gate_blocked` ist → eigene Checks `Video URL fetchbar`/`Gesicht am ASD-Frame` **als `WARN` (neu)** markieren mit Verdict `no_outbound_payload_yet — preclip wurde nie an Sync.so gesendet (blockiert vor Dispatch)`. Damit wird das gelbe Banner aus v129.19 zur Pflicht-Erklärung im Sheet selber.

### C) Sheet-UI klarer

`src/components/admin/SyncsoForensicsSheet.tsx`:

- Wenn `video_source_kind === "plate"`: rote Pille **„Preclip nicht dispatcht — Crop-Bug vor Versand"** statt der grünen `PASS`-Reihen drumherum, plus Quick-Action „Re-Dispatch erzwingen (mit neuer Plate-Detection)".
- Version-Badge → `v129.20`.

### D) Memory update

`mem://architecture/lipsync/sync-3-doc-strict-options-v106`:

- Ergänzen: Plate-Face-Detection ist **Pflicht für jede Speaker-Anzahl ≥ 1**, nicht erst ab 2. Anchor-Rescale allein ist als Sync.so-Koordinate **verboten**.

## Files

- `supabase/functions/compose-dialog-segments/index.ts` — Bedingung + Single-Speaker-Branch + Hard-Refund-Pfad.
- `supabase/functions/syncso-preflight/index.ts` — WARN-Status wenn outbound fehlt.
- `src/components/admin/SyncsoForensicsSheet.tsx` — Pille + Version-Badge.
- `mem/architecture/lipsync/sync-3-doc-strict-options-v106.md` — Plate-Detection ab N=1 als Invariant.

## Verifikation

1. Re-Dispatch dieselbe Hook-Szene → Edge-Log zeigt `plate-identity faces=1 resolved=1/1`, Sync.so bekommt eine Koord die zum Gesicht passt.
2. Sheet öffnen → `source=preclip · frame=1 · coord=[…]`, alle 6 Checks grün, Sync.so läuft durch.
3. Wenn Hailuo eine gesichtslose Plate liefert → klarer Refund + UI-Banner statt stillem Sync.so-Fehler.
