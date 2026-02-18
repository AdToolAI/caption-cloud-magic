

# Fix: Universal Creator nutzt falsche Lambda-Funktion

## Bewiesenes Problem (aus Logs)

- S3-Polling laeuft korrekt (beide Pfade werden gecheckt)
- `source: 'universal-creator'` wird korrekt gesendet
- Aber BEIDE S3-Pfade geben dauerhaft 404 zurueck -- Lambda produziert NIE Output
- Nach 8 Minuten: Client-Timeout

## Root Cause: Unterschiedliche Lambda-Funktionen

| Funktion | Lambda Name | Status |
|----------|------------|--------|
| Director's Cut (funktioniert) | `remotion-render-4-0-377-mem3008mb-disk10240mb-600sec` | OK |
| Universal Creator (crasht) | `remotion-render-4-0-392-mem3008mb-disk10240mb-600sec` | Nie Output |
| check-remotion-progress | `remotion-render-4-0-392-mem3008mb-disk10240mb-600sec` | (nur fuer Bucket-Name) |

Die Lambda `4-0-392` existiert moeglicherweise nicht oder ist nicht korrekt konfiguriert. Director's Cut verwendet `4-0-377` und funktioniert einwandfrei.

## Loesung: Gleiche Lambda wie Director's Cut verwenden

### Aenderung 1: Lambda-Name in auto-generate-universal-video korrigieren
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Zeile 7 aendern:
- Alt: `remotion-render-4-0-392-mem3008mb-disk10240mb-600sec`
- Neu: `remotion-render-4-0-377-mem3008mb-disk10240mb-600sec`

### Aenderung 2: Lambda-Name in check-remotion-progress korrigieren
**Datei:** `supabase/functions/check-remotion-progress/index.ts`

Zeile 12 aendern:
- Alt: `remotion-render-4-0-392-mem3008mb-disk10240mb-600sec`
- Neu: `remotion-render-4-0-377-mem3008mb-disk10240mb-600sec`

### Aenderung 3: Edge Functions deployen

Beide Funktionen muessen nach der Aenderung deployed werden.

## Warum das funktioniert

Director's Cut nutzt `4-0-377` mit dem gleichen REMOTION_SERVE_URL (Bundle) und rendert erfolgreich. Die Composition `UniversalCreatorVideo` ist im gleichen Bundle. Der einzige Unterschied war die Lambda-Version.

## Alternative (falls 4-0-377 nicht funktioniert)

Falls die Composition `UniversalCreatorVideo` NICHT im Bundle von `4-0-377` ist, muss das Remotion-Bundle neu deployed werden (`npx remotion lambda sites create`) und das REMOTION_SERVE_URL Secret aktualisiert werden.

