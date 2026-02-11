
# Fix: renderId muss zurueck in den Payload (im korrekten Format)

## Root Cause (jetzt wirklich)

Die Beweiskette ist eindeutig:

1. **Funktionierende** `render-with-remotion` Funktion: hat KEIN `outName`, KEIN `renderId` -- aber nutzt **synchronen** Modus und bekommt die echte renderId als Antwort zurueck
2. **Unsere** `auto-generate-universal-video`: nutzt **Event-Modus** (fire-and-forget) -- bekommt KEINE Antwort zurueck
3. Ohne `renderId` im Payload generiert Lambda eine eigene interne ID (z.B. `x7f3k2m9ab`)
4. `progress.json` wird unter `renders/x7f3k2m9ab/progress.json` geschrieben -- wir suchen aber unter `renders/5oqokafh3h/progress.json` --> 404
5. Das `outName`-Objekt koennte Lambda zum Crash bringen (nicht alle Remotion-Versionen unterstuetzen das Format)

**Loesung**: `renderId` zurueck in den Payload (im 10-Zeichen-Format) und `outName` komplett entfernen. So nutzt Lambda UNSERE ID fuer alles:

- `progress.json` --> `renders/5oqokafh3h/progress.json` (dort wo wir suchen)
- `out.mp4` --> `renders/5oqokafh3h/out.mp4` (dort wo wir suchen)
- Webhook bekommt unsere ID als `renderId` zurueck

## Aenderung

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Zeilen 549-553 (der Lambda Payload):

```text
// VORHER (kaputt - kein renderId, outName-Objekt):
privacy: 'public',
outName: {
  key: `renders/${pendingRenderId}/out.mp4`,
  bucketName: DEFAULT_BUCKET_NAME,
},
webhook: {

// NACHHER (korrekt - renderId zurueck, kein outName):
privacy: 'public',
renderId: pendingRenderId,
webhook: {
```

Das ist alles. Eine Zeile hinzufuegen (`renderId`), drei Zeilen entfernen (`outName`-Objekt).

## Warum das funktioniert

| Aspekt | Vorher | Nachher |
|--------|--------|---------|
| Lambda kennt unsere ID | Nein (generiert eigene) | Ja (`renderId` im Payload) |
| progress.json Pfad | `renders/{unbekannt}/...` (404) | `renders/{unsere-id}/...` (gefunden) |
| out.mp4 Pfad | Unklar (outName-Objekt evtl. crasht) | `renders/{unsere-id}/out.mp4` (Standard) |
| check-remotion-progress findet Dateien | Nie (404) | Ja |

## Kein weiterer Code noetig

- `generateRemotionCompatibleId()` erzeugt bereits korrekte 10-Zeichen-IDs
- `check-remotion-progress` sucht bereits unter `renders/${effectiveRenderId}/...`
- Webhook-Config bleibt unveraendert
- Frontend-Polling bleibt unveraendert
