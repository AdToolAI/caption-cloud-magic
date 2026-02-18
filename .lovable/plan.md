
# Fix: Lambda crasht still wegen falschem Payload-Format

## Problem (bewiesen durch Logs)

Lambda gibt `202 Accepted` zurueck, aber:
- **Keine Datei auf S3** (alle HEAD requests = 404)
- **Kein Webhook-Aufruf** (0 Logs in `remotion-webhook`)
- Lambda crasht also **sofort beim Starten** -- noch bevor es ueberhaupt rendert

## Root Cause

Zwei Fehler im Payload:

1. **`outName` als Objekt `{ key, bucketName }`** -- Remotion Lambda erwartet bei direkter HTTP-Invocation entweder einen einfachen String oder gar kein `outName`. Das Objekt-Format wird nur vom Remotion SDK unterstuetzt, nicht bei rohem HTTP-Aufruf. Lambda versucht den Payload zu parsen, scheitert, und crasht still (kein Webhook, kein Output).

2. **`renderId` fehlt** -- Ohne `renderId` generiert Lambda eine eigene ID. Selbst WENN Lambda nicht crashen wuerde, wuerde das Video unter `renders/{lambda-eigene-id}/out.mp4` gespeichert -- nicht unter unserer `pendingRenderId`.

**Beweis:** Der funktionierende Director's Cut benutzt `outName` als einfachen String (`directors-cut-123.mp4`), nicht als Objekt. Und die Architektur-Notiz im System sagt explizit: "renderId muss im Payload sein, outName muss entfernt werden".

## Loesung

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts` (Zeilen 534-554)

Payload aendern:

```
// VORHER (crasht Lambda):
const lambdaPayload = {
  type: 'start',
  ...
  outName: {
    key: `renders/${pendingRenderId}/out.mp4`,
    bucketName: DEFAULT_BUCKET_NAME,
  },
  ...
};

// NACHHER (korrekt):
const lambdaPayload = {
  type: 'start',
  renderId: pendingRenderId,  // Lambda benutzt UNSERE ID
  ...
  // KEIN outName -- Lambda schreibt automatisch nach renders/{renderId}/out.mp4
  ...
};
```

## Warum das funktioniert

| Aspekt | Vorher (crasht) | Nachher (Fix) |
|--------|----------------|---------------|
| `outName` | Objekt (Lambda crasht) | Entfernt (Standard-Pfad) |
| `renderId` | Fehlt (Lambda eigene ID) | Unsere ID (Pfade stimmen) |
| S3-Pfad | Unbekannt (Lambda crasht) | `renders/{pendingRenderId}/out.mp4` |
| Webhook | Wird nie aufgerufen | Wird aufgerufen |

## Erwartetes Ergebnis

1. Lambda bekommt `renderId: "vhdyxysqlz"` und schreibt nach `renders/vhdyxysqlz/out.mp4`
2. S3-Polling findet die Datei und markiert als `completed`
3. Webhook wird ebenfalls aufgerufen als Backup-Mechanismus
