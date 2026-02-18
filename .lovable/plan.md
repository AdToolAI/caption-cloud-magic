
# Fix: S3-Polling sucht am falschen Pfad (source fehlt ueberall)

## Bewiesenes Problem (aus den Logs)

Die Edge Function Logs zeigen es eindeutig:

```
source: undefined
Checking S3 for: renders/7mjoiosn0z/out.mp4   <-- FALSCHER Pfad!
```

Lambda schreibt nach `universal-video-7mjoiosn0z.mp4` (wegen `outName`), aber das Polling sucht bei `renders/7mjoiosn0z/out.mp4` weil `source` an drei Stellen fehlt.

## Root Cause: 3 fehlende `source`-Zuweisungen

1. **`auto-generate-universal-video`** (Zeile 518-527): Der `video_renders` INSERT hat kein `source`-Feld
2. **`UniversalAutoGenerationProgress.tsx`** (Zeile 270): Client-Polling sendet nur `{ renderId }` ohne `source`
3. **`UniversalExportStep.tsx`** (Zeile 183): Gleich -- kein `source` im Request Body

## Loesung: Einfachster und sicherster Ansatz

Statt `outName` und `source`-Logik zu reparieren, entfernen wir `outName` komplett. Dann benutzt Lambda automatisch den Standard-Pfad `renders/{lambda-id}/out.mp4` -- und das S3-Polling sucht bereits dort!

### Aenderung 1: Lambda Payload -- outName entfernen
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

- Zeile 551: `outName: 'universal-video-...'` entfernen
- Lambda benutzt dann seinen eigenen Standard-Pfad

### Aenderung 2: source in video_renders INSERT hinzufuegen
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

- Zeile 518-527: `source: 'universal-creator'` zum INSERT hinzufuegen (fuer zukuenftige Debugging-Zwecke)

### Aenderung 3: source im Frontend-Polling mitsenden
**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

- Zeile 270-272: `source: 'universal-creator'` zum Request Body hinzufuegen

**Datei:** `src/components/universal-video-creator/UniversalExportStep.tsx`

- Zeile 183-185: `source: 'universal-creator'` zum Request Body hinzufuegen

### Aenderung 4: check-remotion-progress S3-Pfad-Logik vereinfachen
**Datei:** `supabase/functions/check-remotion-progress/index.ts`

- Standard-Pfad `renders/{id}/out.mp4` fuer ALLE Quellen verwenden (kein spezieller Universal-Creator-Pfad mehr noetig)
- Die `isUniversalCreator`-Logik entfernen oder als Fallback belassen

## Warum das diesmal funktioniert

| Aspekt | Vorher (kaputt) | Nachher (Fix) |
|--------|----------------|---------------|
| outName im Payload | `universal-video-xxx.mp4` | Keins (Lambda-Standard) |
| Lambda Output-Pfad | `universal-video-xxx.mp4` | `renders/{lambda-id}/out.mp4` |
| S3-Polling sucht | `renders/{id}/out.mp4` (wegen source=undefined) | `renders/{id}/out.mp4` |
| Pfade stimmen | Nie (unterschiedliche Formate) | Ja, wenn Lambda die gleiche ID nutzt |

## Restrisiko

Da Lambda seine EIGENE `renderId` generiert, stimmt `renders/{lambda-id}/out.mp4` moeglicherweise nicht mit `renders/{unsere-id}/out.mp4` ueberein. In diesem Fall muessen wir den Webhook als primaere Completion-Erkennung nutzen (der bekommt die Lambda-ID zurueck und kann sie der `pendingRenderId` zuordnen ueber `customData`).

## Alternative: Beide Pfade checken

Falls wir `outName` beibehalten wollen, muessen wir `source: 'universal-creator'` an ALLEN drei Stellen hinzufuegen UND den `check-remotion-progress` muss BEIDE Pfade checken (erst `universal-video-xxx.mp4`, dann `renders/xxx/out.mp4`).

**Empfehlung:** Alternative umsetzen -- `outName` beibehalten (es kontrolliert den Pfad zuverlaessig) und `source` ueberall hinzufuegen. Zusaetzlich beide S3-Pfade als Fallback checken.
