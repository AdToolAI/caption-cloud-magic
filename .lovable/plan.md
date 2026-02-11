
# Fix: Rendering-Abbruch bei 92% und Retry-Button reparieren

## Hauptproblem: Lambda-Video wird nie gefunden

Die Analyse der DB zeigt: Alle Renders mit `pending-` IDs laufen in ein 8-Minuten-Timeout. Kein einziger wird je als "completed" erkannt.

**Ursache**: Der Lambda-Payload enthaelt kein `outName`-Feld. Ohne `outName` speichert Lambda das fertige Video unter seinem eigenen internen Render-Pfad (z.B. `renders/abc123-lambda-id/out.mp4`). Das S3-Polling sucht aber unter `renders/pending-xxx/out.mp4` -- dieser Pfad existiert nie. Der Webhook wird ebenfalls nie empfangen (keine Webhook-Logs vorhanden), vermutlich weil der `secret`-Wert nicht korrekt validiert wird oder Lambda den Webhook nicht erreicht.

**Ergebnis**: Weder S3-Polling noch Webhook erkennen die Completion. Nach 8 Minuten greift das Timeout und der Render wird als "failed" markiert.

## Nebenproblem 1: Format immer 16:9

Der Screenshot zeigt "16:9 - YouTube / Website" obwohl Reels gewaehlt wurde. Das Problem liegt in der Weitergabe: Die `onConsultationComplete` Funktion im Wizard uebergibt `consultationResult` an den Backend-Aufruf, aber das Feld `aspectRatio` aus dem Consultant wird moeglicherweise nicht korrekt durchgereicht, weil `auto-generate-universal-video` den Body-Parameter `consultationResult` (nicht `briefing`) empfaengt und in Zeile 46 konvertiert: `const actualBriefing = briefing || consultationResult`. Das `aspectRatio` Feld muss in der Consultation-Extraktion korrekt gesetzt sein (wurde bereits im letzten Fix gemacht), aber der Frontend-Parameter heisst `consultationResult`, was korrekt auf `actualBriefing` gemappt wird.

## Nebenproblem 2: "Erneut versuchen" macht nichts

Der `handleRetry` in `UniversalVideoWizard.tsx` setzt `isAutoGenerating = true` und `currentStep = 3`. Aber `UniversalAutoGenerationProgress` startet die Generation nur im `useEffect([], [])` -- bei einem Re-Render ohne Unmount passiert nichts. Das Problem: React mounted die Komponente nicht neu, wenn sie schon gemounted ist. Ein `key`-Prop muss die Neuinitialisierung erzwingen.

---

## Aenderungen

### 1. Lambda-Payload: `outName` hinzufuegen

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Dem `lambdaPayload` (Zeile 525) das Feld `outName` hinzufuegen, damit Lambda das Video unter dem `pending-` Pfad auf S3 ablegt. Dann findet das S3-Polling das Video:

```text
outName: `${pendingRenderId}/out.mp4`,
```

Zusaetzlich das `renderId`-Feld setzen, damit Lambda den Render-Ordner korrekt benennt:

```text
renderId: pendingRenderId,
```

So wird das fertige Video unter `renders/pending-xxx/out.mp4` gespeichert -- genau dort wo das S3-Polling sucht.

### 2. Retry-Button reparieren: Key-basiertes Re-Mount

**Datei:** `src/components/universal-video-creator/UniversalVideoWizard.tsx`

Einen `retryCount` State hinzufuegen, der bei jedem Retry inkrementiert wird. Dieser wird als `key` an `UniversalAutoGenerationProgress` uebergeben, was ein vollstaendiges Re-Mount erzwingt:

```text
const [retryCount, setRetryCount] = useState(0);

const handleRetry = () => {
  setError(null);
  setRetryCount(prev => prev + 1);  // Erzwingt Re-Mount
  if (consultationResult && generationMode === 'full-service') {
    setIsAutoGenerating(true);
    setCurrentStep(3);
  }
};

// In JSX:
<UniversalAutoGenerationProgress
  key={`gen-${retryCount}`}   // Key erzwingt Re-Mount bei Retry
  ...
/>
```

### 3. "early_drop" Shutdown verhindern

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Die `early_drop` Logs deuten darauf hin, dass die Edge Function beendet wird bevor `waitUntil` seine Arbeit abschliesst. Da Lambda jetzt asynchron aufgerufen wird (Event-Modus, 202 sofort), sollte die Pipeline innerhalb von 2-3 Minuten bis zum Lambda-Aufruf kommen und sich dann sofort beenden. Sicherstellen, dass nach dem Lambda-202-Response die Pipeline sauber endet ohne weitere lang laufende Operationen.

### 4. Format-Anzeige in Progress-UI korrigieren

**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

Die `consultationResult.aspectRatio` muss auch auf der Fallback-Ebene korrekt gelesen werden. Falls `aspectRatio` nicht direkt gesetzt ist, aus `format` oder `outputFormats` ableiten:

```text
const selectedAspectRatio = consultationResult?.aspectRatio 
  || consultationResult?.format 
  || consultationResult?.outputFormats?.[0] 
  || '16:9';
const STEPS = buildSteps(selectedAspectRatio);
```

---

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `auto-generate-universal-video/index.ts` | `outName` und `renderId` zum Lambda-Payload hinzufuegen, damit S3-Pfad uebereinstimmt |
| `UniversalVideoWizard.tsx` | `retryCount` als Key fuer Re-Mount bei "Erneut versuchen" |
| `UniversalAutoGenerationProgress.tsx` | `aspectRatio` Fallback-Logik robuster machen |

## Erwartetes Ergebnis

- Lambda speichert Video unter `renders/pending-xxx/out.mp4`
- S3-Polling erkennt Completion und zeigt 100%
- "Erneut versuchen" startet tatsaechlich eine neue Generierung
- Das korrekte Format (9:16 fuer Reels) wird angezeigt und gerendert
