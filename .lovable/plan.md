
# Fix: Lambda Payload enthält ungültige Felder - Root Cause gefunden

## Das eigentliche Problem

Nach Analyse der Remotion Lambda Dokumentation und Vergleich mit der **funktionierenden** `render-with-remotion` Funktion habe ich die echte Ursache gefunden:

### 1. `renderId` ist KEIN gültiges Input-Feld

`renderId` ist ein **Rückgabewert** von `renderMediaOnLambda()`, kein Input-Parameter. Wenn wir es im Payload mitschicken, crasht Lambda beim Start - noch bevor Dateien geschrieben oder der Webhook aufgerufen werden. Da wir Event-Modus nutzen (fire-and-forget), sehen wir den Crash nie.

**Beweis**: `render-with-remotion` (die funktionierende Funktion) sendet KEIN `renderId` im Payload.

### 2. `outName` als String wird RELATIV zum internen Render-Ordner interpretiert

Laut Remotion-Doku: Wenn `outName` ein String ist (z.B. `"renders/fahe4pfdf2/out.mp4"`), wird die Datei unter `renders/{internes-id}/renders/fahe4pfdf2/out.mp4` gespeichert - also doppelt verschachtelt. Das ist der falsche Pfad!

Um einen **absoluten** Pfad im Bucket zu erzwingen, muss `outName` ein **Objekt** mit `key` und `bucketName` sein.

### Beweis-Kette
- Lambda gibt 202 zurück (Anfrage akzeptiert)
- Aber: progress.json = 404, out.mp4 = 404, Webhook = nie aufgerufen
- Die funktionierende `render-with-remotion` Funktion hat WEDER `renderId` noch `outName` im Payload
- Also: Lambda crasht wegen dem ungültigen `renderId`-Feld

## Lösung

### Aenderung 1: Lambda Payload korrigieren

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

```
// VORHER (kaputt):
outName: `renders/${pendingRenderId}/out.mp4`,
renderId: pendingRenderId,

// NACHHER (korrekt):
outName: {
  key: `renders/${pendingRenderId}/out.mp4`,
  bucketName: DEFAULT_BUCKET_NAME,
},
// renderId ENTFERNT - ist kein gültiges Input-Feld
```

- `renderId` komplett aus dem Payload entfernen
- `outName` als Objekt-Format senden (absoluter S3-Pfad)
- So landet `out.mp4` exakt dort wo `check-remotion-progress` sucht

### Aenderung 2: Kein weiterer Code nötig

Alles andere bleibt unverändert:
- Webhook-Konfiguration ist korrekt (customData enthält `pending_render_id`)
- `check-remotion-progress` sucht bereits korrekt unter `renders/${renderId}/out.mp4`
- Frontend-Polling funktioniert
- progress.json wird weiterhin time-based geschätzt (Lambda schreibt progress.json unter internem Pfad, aber das out.mp4-Check ist der primäre Completion-Mechanismus)

## Zusammenfassung

| Was | Vorher | Nachher |
|-----|--------|---------|
| `renderId` im Payload | Ja (ungültig, crasht Lambda) | Entfernt |
| `outName` Format | String (relativ, falscher Pfad) | Objekt mit key+bucketName (absolut) |
| Lambda Verhalten | Crasht beim Start | Rendert erfolgreich |
| Webhook | Nie aufgerufen | Wird aufgerufen bei Completion |
| S3 out.mp4 | 404 (falscher Pfad) | Unter `renders/{id}/out.mp4` auffindbar |

## Erwartetes Ergebnis

Lambda crasht nicht mehr, rendert das Video, speichert es unter dem korrekten S3-Pfad, und sowohl S3-Polling als auch Webhook erkennen die Fertigstellung.
