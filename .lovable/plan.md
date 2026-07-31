## Befund (verifiziert an der Live-Szene)

Die Szene `0fab8a39…` hängt **nicht** im Render, sie wurde bewusst geparkt:

- `clip_status = 'awaiting_manual_face_map'`
- `clip_error = "anchor_identity_needs_review: 0/2 Sprecher konnten automatisch zugeordnet werden…"`
- `twoshot_stage = 'anchor'`, kein Provider-Job, kein Credit verbraucht

Im Anchor-Datensatz stehen **beide** Gesichter korrekt erkannt (2 Boxen, `expectedCount: 2`), aber `similarity: null` bei beiden → AWS CompareFaces konnte die Portraits nicht gegen den Anchor matchen. Damit ist `resolvedCount = 0` → Total-Miss → Hard-Gate in `compose-video-clips` (Zeile ~2983) bricht vor dem Provider-Dispatch ab.

Zwei getrennte Fehler:

1. **UI-Sackgasse:** Die Kachel im Storyboard (`SceneInlinePlayer.tsx`) kennt den Status `awaiting_manual_face_map` nicht. `twoshotStage='anchor'` fällt nicht in die Terminal-Liste → `lipsyncRunning` = true → `isWorking` = true → **endloser Spinner „Szene wird gebaut… VO & Lip-Sync inklusive"**. Der vorhandene Face-Map-Review-CTA existiert nur in `SceneClipProgress.tsx`, das in dieser Ansicht nicht gerendert wird.
2. **Gate zu scharf:** Der Block feuert auch dann, wenn die Geometrie eindeutig ist (erkannte Gesichter == Sprecheranzahl) und lediglich der biometrische Vergleich keine Ähnlichkeit liefert. Für genau diesen Fall existiert bereits ein deterministischer Fallback (`anchor_face_layout`, v278, row-major) — er wird nur nicht genutzt.

## Fix

### 1. UI: kein Endlos-Spinner mehr (`SceneInlinePlayer.tsx`)
- `awaiting_manual_face_map` explizit aus `isWorking`/`lipsyncRunning` ausschließen.
- Eigener Overlay-Zustand: bernsteinfarbener Badge „Face-Map prüfen", Kurztext und Button **„Zuordnung öffnen"**, der `FaceMapReviewDialog` mit derselben Szene öffnet (Komponente ist vorhanden und funktionsfähig — die Anchor-Boxen sind da).
- Klick auf den Button darf die Szenen-Auswahl nicht triggern (`stopPropagation`).

### 2. Gate: nur blocken, wenn es wirklich mehrdeutig ist (`compose-video-clips/index.ts`)
- Neue Bedingung für `needsManualReview` (Soft-Gate-Pfad): Block nur, wenn `resolved === 0` **und** die Zahl der erkannten Gesichter ≠ Sprecheranzahl (`anchor_face_layout.slots.length < expected`).
- Bei `faces.length === expected` und fehlender Biometrie: `assignmentLock` deterministisch aus `anchor_face_layout` (row-major, links→rechts) setzen, `assignmentLockSource = 'v326_geometry_rowmajor'`, `status = 'geometry'` — Dispatch läuft normal weiter.
- Diese Szenen bekommen in der Kachel einen dezenten Hinweis „Zuordnung per Geometrie" mit Link zum Review, damit der Kunde bei Bedarf korrigieren kann, aber nichts blockiert.

### 3. Sichtbarkeit statt Stille
- Fällt der Hard-Block doch (echter Mismatch), wird `clip_error` in der Kachel als kurzer Klartext gezeigt statt eines Spinners; die Lange Erklärung bleibt im Review-Dialog.

## Sofortmaßnahme für die aktuelle Szene
Nach dem Deploy kann die geparkte Szene über den neuen Button zugeordnet und gestartet werden — alternativ setzt der Geometrie-Fallback sie beim nächsten „Generieren" direkt fort. Kein Credit-Verlust, kein Reset des Projekts nötig.

## Technische Details
- Dateien: `src/components/video-composer/SceneInlinePlayer.tsx`, `supabase/functions/compose-video-clips/index.ts`
- Kein DB-Schema-Change, keine Migration.
- `V276_SOFT_GATE=false` (Legacy-Hard-Gate) bleibt als Notschalter unverändert wirksam.
