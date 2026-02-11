

# Fix: Remotion Lambda Render-ID Format-Inkompatibilitaet

## Root Cause (endgueltig identifiziert)

Die Analyse zeigt eine klare Beweiskette:

1. Lambda wird erfolgreich gestartet (Status 202)
2. Aber: progress.json ist IMMER 404, out.mp4 ist IMMER 404
3. Webhook wird NIE aufgerufen (null Logs)
4. **Alle erfolgreichen alten Renders** haben kurze IDs: `a0vvomu51t`, `43gccf8rfi`, `4gz0pmk87g` (10 Zeichen, nur Buchstaben/Zahlen)
5. Unsere IDs: `pending-8bc95e63-4249-43e6-8f4d-64ebb1177553` (47 Zeichen mit Bindestrichen)

**Remotion Lambda v4 generiert intern 10-stellige alphanumerische Render-IDs.** Wenn wir eine inkompatible `renderId` im Payload senden (zu lang, Bindestriche), stuerzt Lambda beim Initialisieren ab - noch BEVOR irgendwelche Dateien geschrieben oder der Webhook aufgerufen werden. Da wir Event-Modus nutzen (fire-and-forget), bekommen wir diesen Crash nie mit.

## Loesung

Render-IDs im Remotion-kompatiblen Format generieren: 10 Zeichen, nur Kleinbuchstaben und Ziffern.

### Aenderung 1: Kompatible Render-ID generieren

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Eine Helper-Funktion hinzufuegen, die IDs im gleichen Format wie Remotion generiert:

```text
function generateRemotionCompatibleId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
```

Dann `pendingRenderId` aendern von:
```text
const pendingRenderId = `pending-${crypto.randomUUID()}`;
```
zu:
```text
const pendingRenderId = generateRemotionCompatibleId();
```

### Aenderung 2: outName vereinfachen

Da die neue Render-ID jetzt Remotion-kompatibel ist, wird Lambda automatisch den Ordner `renders/{renderId}/` anlegen. Das `outName` kann entweder beibehalten werden (als Sicherheit) oder auf nur den Dateinamen reduziert werden:

```text
outName: `renders/${pendingRenderId}/out.mp4`,
```

Dies bleibt wie bisher - es ist konsistent mit dem Pfad in `check-remotion-progress`.

### Aenderung 3: isPendingId Check anpassen

**Datei:** `supabase/functions/check-remotion-progress/index.ts`

Da die neuen IDs nicht mehr mit `pending-` anfangen, den `isPendingId` Check entfernen oder anpassen. Die S3-Polling-Logik funktioniert bereits unabhaengig von diesem Flag - es wird nur fuer Logging genutzt.

### Aenderung 4: Frontend Polling-Logik

**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

Die Frontend-Komponente prueft moeglicherweise auf `pending-` Prefix. Sicherstellen, dass das Polling mit beliebigen Render-IDs funktioniert.

---

## Erwartetes Ergebnis

| Vorher | Nachher |
|--------|---------|
| `pending-8bc95e63-4249-...` (47 Zeichen, Bindestriche) | `k8m2x9fn4a` (10 Zeichen, alphanumerisch) |
| Lambda stuerzt beim Start ab | Lambda rendert erfolgreich |
| progress.json: 404 | progress.json: wird geschrieben |
| Webhook: nie aufgerufen | Webhook: meldet Completion |
| S3 out.mp4: 404 | S3 out.mp4: wird gespeichert |
| UI haengt bei 92% | UI zeigt echten Fortschritt und 100% |

## Technische Details

Nur 2 Dateien muessen geaendert werden:

| Datei | Aenderung |
|-------|-----------|
| `auto-generate-universal-video/index.ts` | `generateRemotionCompatibleId()` statt `pending-${crypto.randomUUID()}` |
| `check-remotion-progress/index.ts` | `isPendingId` Check entfernen (nur Logging, keine funktionale Auswirkung) |

