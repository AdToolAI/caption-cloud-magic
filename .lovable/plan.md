# Root Cause: v166 Anchor-Bridge blockt Single-Speaker Fallback

Du hast Recht — die Pipeline selbst (compose-dialog-segments v169, Sync.so, ASD, Webhook, Watchdog) ist intakt. Der Fehler kommt aus dem **Hydrations-Schritt vor** dem Dispatch, genauer aus der v166-Änderung in `compose-dialog-segments/index.ts:1523-1565`.

## Was passiert (Single-Speaker-Szene aus dem Screenshot)

1. Hailuo rendert die Plate → 1 Gesicht wird von Gemini Vision detektiert.
2. `plate-face-identity` versucht das Gesicht einem `brand_character` zuzuordnen, aber:
   - Der Speaker-Record trägt eine **präfixierte ID** wie `outfit:<uuid>` oder `pose:<uuid>` (Saved-Outfit-Look, den wir letzte Woche eingebaut haben).
   - `byId.get(cid)` schlägt fehl, weil die Plate-Face mit der reinen `brand_character.id` gelabelt ist (ohne Präfix).
3. Vorher (vor v166) gab es einen `unlabeled.find(f => f.slot === idx)` Fallback → bei N=1 hat das immer das einzige Gesicht zurückgegeben → es funktionierte.
4. v166 hat diesen Fallback **komplett entfernt**, um den Multi-Speaker-Bug zu fixen (Sprecher 3 von Sprecher 1 animiert). Das ist für N≥2 korrekt, aber für **N=1 zu hart**: bei einer Single-Speaker-Szene ist "das einzige Gesicht" unzweideutig das richtige.
5. Folge: `speakerPlateBboxes[0]` bleibt `null` → der `v153.2_preflight_BLOCK` (Zeile 1638-1735) feuert mit `v153_plate_box_missing_for_speakers=[0]` → Refund + die Meldung "für den Sprecher konnte kein eindeutiges Gesicht in der Szene gefunden werden".

Das passt 1:1 zum Screenshot (Single-Speaker, "Lipsync abgebrochen", Credits refunded, hailuo-Master ist schon gerendert).

## Fix (3 chirurgische Änderungen, KEINE Pipeline-Änderung)

### 1. `supabase/functions/compose-dialog-segments/index.ts` — `resolveBaseCharacterId` Helper + Normalisierung

Vor der `speakers.forEach`-Schleife (≈1523):

```ts
const stripIdPrefix = (id?: string | null) =>
  String(id ?? "").toLowerCase().replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");
```

Dann an **zwei** Stellen anwenden:
- `byId.set(stripIdPrefix(f.characterId), f)` (Zeile 1509)
- `const cid = stripIdPrefix(sp.character_id);` (Zeile 1524)

Damit matcht `outfit:abc-uuid` (Speaker) wieder auf `abc-uuid` (Plate-Face) — die ursprüngliche Identitätsauflösung funktioniert wieder, ohne den v166-Multi-Speaker-Schutz aufzuweichen.

### 2. Single-Speaker-Safety-Net wiederherstellen

Innerhalb von `if (!plateFace && unlabeled.length > 0)` (Zeile 1527-1538) einen N=1-Pfad hinzufügen, **bevor** der `console.warn`:

```ts
if (speakers.length === 1) {
  plateFace = unlabeled[0]; // schon nach Bbox-Fläche absteigend sortiert (Z. 1516-1522)
  source = "single-speaker-largest-face";
}
```

Begründung: Bei N=1 gibt es per Definition keinen "falschen Sprecher". Der v166-Bug betraf nur N≥2 (script-order ≠ visual-order). Bei N=1 ist das größte Gesicht ohne Identität immer die richtige Wahl — genau wie es vor v166 lief.

### 3. Auch `characters` Liste vor `plate-face-identity` normalisieren

`plate-face-identity` bekommt `characters` als Eingabe (≈1457). Wir prüfen kurz, ob dort dieselbe Präfix-ID landet, und strippen sie bei Aufbau. Falls die Liste bereits aus `useAccessibleCharacters` mit base-IDs kommt, ist hier nichts zu tun — wir verifizieren das beim Implementieren mit einem `grep`.

## Was NICHT geändert wird (Pipeline bleibt unangetastet)

- `compose-dialog-segments` v169-Architektur (parallel fan-out, per-pass lock, RPC writes)
- `sync-so-webhook`, `lipsync-watchdog`, `finalize-dialog-scene`
- `asd-strategy` (frame_number/bounding_boxes_url, kein auto_detect für N≥2)
- Retry-Ladder, Sync.so Payload-Rules, 429-Backoff
- v166-Bridge für N≥2 (bleibt strikt, kein slot-index-Fallback)
- v153.5 Hard-Fail für N≥2 (bleibt, korrekter Schutz)

## Verifikation nach dem Fix

1. Logs prüfen: für die fehlgeschlagene Szene sollte `v166_anchor_identity_slot_bridge` ODER `single-speaker-largest-face` erscheinen statt `v166_no_identity_for_speaker`.
2. Re-Render in der gleichen Szene → `speakerPlateBboxes[0]` ist gesetzt → Preflight passiert → Dispatch zu Sync.so läuft.
3. Multi-Speaker-Test (2-Sprecher-Szene mit korrekten brand_characters) muss weiterhin sauber laufen — der v166-Schutz greift dort nach wie vor.

## Aufwand
~25 Zeilen in einer Datei. Keine Migration, keine neuen Edge Functions, kein Schema-Change.
