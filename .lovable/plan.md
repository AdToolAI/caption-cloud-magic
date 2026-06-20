## v152 — Unified bbox-url-pro Pipeline (N=1..4)

Einheitlicher Sync.so-Pfad für **alle** Dialog-Pässe: Full-Plate + `bounding_boxes_url`. Single-Speaker und Multi-Speaker laufen über genau denselben Code. Preclip-Render + Face-Gate verschwinden komplett aus dem Standardpfad.

### Warum

- Aktueller Multi-Speaker-Fehler (`face_gate_failed:count=0` für Matthew) ist ein Symptom der Pipeline-Spaltung: v116-Preclip-Render läuft als Pflicht, kollidiert mit v126-Guard, blockiert den eigentlich funktionierenden `bbox-url-pro`-Dispatch.
- bbox-url-pro mit synthetischem Fallback (Zeile 4362: bbox aus `pass.coords` + plate dims) kann mathematisch *nicht fehlschlagen*, solange Coords + plate dims vorhanden sind — beides ist ab v126 schon Voraussetzung.
- Spart 1–3 Lambda-Renders pro Pass (~60–180s Latenz pro Speaker).

### Änderungen — `supabase/functions/compose-dialog-segments/index.ts`

**A) `v150FreshBboxEligible` → `v152UnifiedBboxEligible` (Zeile ~2797)**

```ts
const v152UnifiedBboxEligible =
  !isRetry &&
  body?.noop_auto_escalation !== true &&
  speakers.length >= 1 &&                              // ← war >=2
  !!plateDims &&
  Array.isArray(pass.coords) &&
  Number.isFinite(Number(pass.coords?.[0])) &&
  Number.isFinite(Number(pass.coords?.[1])) &&
  // N=1: keine identity-disambiguation nötig (1 Gesicht, 1 Sprecher).
  // N>=2: weiterhin Plate-Identity-Map erforderlich für deterministische Box-Zuordnung.
  (speakers.length === 1 ||
    (!!plateIdentityMap && plateIdentityMap.resolvedCount > 0));

if (v152UnifiedBboxEligible) {
  (pass as any).preclip_url = null;
  (pass as any).preclip_render_id = null;
  (pass as any).preclip_crop = null;
  (pass as any).preclip_error = null;
  (pass as any)._v152BboxPrimary = true;
  console.warn(
    `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v152_unified_bbox_primary speakers=${speakers.length} resolved=${plateIdentityMap?.resolvedCount ?? "n=1"} speaker=${pass.speaker_name ?? "?"}`,
  );
}
```

**B) v116-Preclip-Render-Schleife gaten (Zeile ~3731)**

Vor `const EXPANSION_LADDER = [1.0, 1.4, 1.8]`:

```ts
if ((pass as any)._v152BboxPrimary) {
  console.log(
    `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v152_skip_preclip_render bbox-url-pro PRIMARY`,
  );
} else {
  // bestehende EXPANSION_LADDER-Loop + Face-Gate unverändert (Legacy/Retry-Pfad)
}
```

Komplett-Entfernung des Codes machen wir in v153 nach 1–2 Wochen Telemetrie — solange bleibt die Schleife als sicherer Fallback für `noop_auto_escalation`-Retries und edge-cases im Legacy-Pfad.

**C) v126-Hard-Fail-Guard für `_v152BboxPrimary` entschärfen (Zeile ~3892)**

```ts
if (
  v126PreclipExpected &&
  !usePassPreclip &&
  !(pass as any)._v152BboxPrimary   // ← neu
) {
  // bestehender Refund-/Abort-Pfad
}
```

**D) bbox-url-pro Hard-Fail statt Silent-Downgrade (Zeile ~4396–4445)**

Aktuell fällt der Pfad bei Upload-Fail oder 0 voiced frames auf `coords-pro` zurück. Ab v152: **harter Abbruch + Refund + klare User-Message**, gemäß User-Vorgabe.

```ts
const v147BboxValid = !!usedUrl && nonNullFrames >= 1;

// v152 — Bbox sanity gates (vor v147BboxValid):
const dimsArea = (plateDims?.width ?? 0) * (plateDims?.height ?? 0);
const boxArea = box ? (box[2] - box[0]) * (box[3] - box[1]) : 0;
const boxAreaPct = dimsArea > 0 ? boxArea / dimsArea : 0;
const v152BboxSane = boxAreaPct >= 0.002 && boxAreaPct <= 0.45;  // 0.2% .. 45% der Plate

if (v147BboxValid && v152BboxSane) {
  // bestehender Dispatch unverändert
} else if (retryVariant === "coords-pro-box") {
  // Inline-Fallback für expliziten coords-pro-box Retry bleibt
} else if ((pass as any)._v152BboxPrimary) {
  // HARD-FAIL für v152 unified path — kein blinder Downgrade
  const reason = !usedUrl
    ? "bbox_url_upload_failed"
    : nonNullFrames < 1
      ? "bbox_zero_voiced_frames"
      : `bbox_geometry_insane:area_pct=${(boxAreaPct * 100).toFixed(2)}`;
  // → triggert dieselbe Refund-/User-Message-Routine wie v126 (extrahieren in
  //   eine kleine Helper-Funktion `failPassWithRefund(reason, friendlyMsg)`,
  //   die bereits aus dem v126-Block kopiert wird)
  return await failPassWithRefund({ reason, friendlyMsg: `Lip-Sync für „${pass.speaker_name}" konnte nicht vorbereitet werden (${reason}). Bitte Szene neu rendern — Sprecher muss frontal und unverdeckt im Bild sein. Credits zurückerstattet.` });
} else {
  // Legacy-Pfad: bestehender silent downgrade auf coords-pro (für non-v152 Pässe)
  retryVariant = "coords-pro";
  // ...
}
```

**E) bbox-Robustheit (innerhalb derselben Box-Construction, Zeile ~4330–4371)**

Reihenfolge der bbox-Quellen härten:
1. **faceMap matched face** (Gemini Vision, by characterId → slotIndex) — wie heute
2. **NEU: Rekognition-Snap auf plate frame** wenn faceMap miss oder bbox-area `< 0.5%`: bereits vorhandener `v135_pre_snap` (Zeile ~3672) liefert Rekognition-Coords; bei Erfolg deren bbox nutzen (cx/cy ±50%w/80%h Heuristik)
3. **Synthetic from pass.coords** (heutiger Fallback, Zeile 4362) — bleibt als letzte Stufe

Die ersten zwei sind bereits Code, müssen nur in einer Kette stehen statt als sich gegenseitig ausschließende Branches.

**F) Log-Klarheit (Zeile ~3005)**

Im `v147_dispatch_reason`-Log zusätzlich `v152_unified_path: !!(pass as any)._v152BboxPrimary` und `bbox_area_pct` mitloggen für forensische Triage.

### Was NICHT entfernt wird (noch nicht)

- v116 EXPANSION_LADDER + Face-Gate-Code → bleibt als Legacy-Fallback für `noop_auto_escalation`-Retry-Variants (`coords-pro`, `sync3-coords`, `coords-pro-lp2pro`). Komplettentfernung folgt in v153 nach Telemetrie-Bestätigung.
- v151 Identity-Swap-Hardening, v150 NOOP-Bytes-Heuristik, v149 Master-Watchdog, v148 NOOP-Bypass, Sync.so-Webhook, alle Refund-Logiken.
- Retry-Pfad: `RETRY_VARIANTS = ["bbox-url-pro", "coords-pro", "coords-pro-box", "sync3-coords", "coords-pro-lp2pro", "auto-pro", "auto-standard"]` unverändert.

### Recovery für laufende Szene

Nach Deploy: User klickt **„Sauber neu starten"** → Fresh-Dispatch trifft `v152UnifiedBboxEligible=true` für alle 4 Sprecher → keine Preclip-Render mehr → bbox-url-pro PRIMARY direkt.

### Files

- **Edit**: `supabase/functions/compose-dialog-segments/index.ts` (~50 Zeilen netto Diff, davon ~25 neue helper-Funktion `failPassWithRefund` durch Extraktion aus v126-Block)
- **Create**: `mem/architecture/lipsync/v152-unified-bbox-pipeline.md` (Architektur-Memo: einheitliche Pipeline + Hard-Fail-Policy + bbox-Robustheits-Kette)
- **Edit**: `mem/index.md`, `.lovable/plan.md`
- **Deploy**: `compose-dialog-segments`

### Telemetrie-Plan (für spätere v153 Cleanup-Entscheidung)

Nach Deploy für 7 Tage tracken: `count(v152_unified_bbox_primary)` vs `count(v152_skip_preclip_render)` vs `count(bbox_geometry_insane)` vs `count(bbox_url_upload_failed)`. Wenn Insane-Rate < 1% und Upload-Fail-Rate < 0.1% → v153 entfernt Preclip-Loop komplett.
