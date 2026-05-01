## Befund

Der aktuelle Screenshot zeigt keinen harten roten Code-Fehler mehr, sondern zwei getrennte Themen:

1. **Flow 2 ist gelb `timeout`**  
   Das ist aktuell korrekt klassifiziert: AWS Lambda Concurrency/`Rate Exceeded` wird nicht mehr als roter Bug gewertet. Die UI zeigt deshalb `4/5 (80%) · 1 timeout`.

2. **Flow 4 bleibt `budget_skipped`, obwohl Bootstrap ausgeführt wurde**  
   Ich habe die aktuellen Daten geprüft: `test-portrait.png` existiert im `qa-test-assets` Bucket. Trotzdem zeigt der Deep Sweep bei Flow 4 `dedicated_portrait: false` und HeyGen meldet `400127 No face detected`.

Die Ursache ist eine Kombination aus:

- `qa-test-assets` ist ein privater Bucket.
- `qa-weekly-deep-sweep` versucht für das Portrait aktuell eine Public URL über `getPublicUrl()`. Bei privaten Buckets ist das für externe Provider nicht zuverlässig nutzbar.
- Für Bild und Maske gibt es bereits Signed-URL-Logik, aber **nicht für `test-portrait.png`**.
- Zusätzlich ist der Bootstrap idempotent: Wenn ein vorhandenes Portrait technisch valide ist (Dateigröße/MIME), wird es nicht ersetzt, selbst wenn HeyGen darin kein Gesicht erkennt. Ein einmal schlecht generiertes Portrait bleibt also bestehen.
- Der UI-Button für direkten Bootstrap-Fix hängt noch an `flow_index === 7`, obwohl Magic Edit inzwischen Flow 6 ist und Talking Head Flow 4 ist.

## Plan

### 1. Portrait im Deep Sweep per Signed URL laden

In `qa-weekly-deep-sweep/index.ts` erweitere ich `getSignedAssets()` um ein dediziertes `portrait` Feld:

- `test-portrait.png` wird per `createSignedUrl()` signiert.
- `RunCtx.signedAssets` bekommt `{ image, mask, portrait }`.
- `flowTalkingHead()` nutzt künftig diese Reihenfolge:
  1. `ctx.signedAssets.portrait`
  2. optionaler stabiler Fallback
  3. kein generisches Produktbild mehr als stiller Portrait-Fallback

Damit sieht HeyGen wirklich das Bootstrapped-Portrait statt einer privaten/ungeeigneten URL oder dem generischen `test-image.png`.

### 2. Bootstrap-Portrait zuverlässig reparieren, nicht nur nach MIME/Size

In `qa-live-sweep-bootstrap/index.ts` ändere ich die Portrait-Strategie:

- Für `test-portrait.png` wird ein robuster `force`/`replace`-Pfad eingebaut, sodass das Portrait beim Bootstrap gezielt ersetzt werden kann, statt ein altes ungeeignetes Asset zu behalten.
- Der aktuelle AI-Gateway Modellname wird korrigiert/vereinheitlicht auf ein unterstütztes Bildmodell aus dem Projekt-Setup.
- Falls AI-Bildgenerierung nicht klappt, wird ein klarer, HeyGen-tauglicher Fallback verwendet bzw. der Bootstrap gibt explizit zurück, dass das Portrait nicht sicher provisioniert werden konnte.
- Zusätzlich werden Logs/Response-Felder verbessert (`uploaded`, `repaired`, `replaced`, `contentType`, grobe Größe), damit im UI sichtbar ist, was tatsächlich passiert ist.

### 3. Keine generischen Produktbilder mehr als Talking-Head-Fallback

`flowTalkingHead()` soll nicht mehr `signedAssets.image` oder `assets.image` an HeyGen schicken, wenn kein dediziertes Portrait verfügbar ist. Das erzeugt genau den aktuellen Fehler: HeyGen versucht ein Produkt-/Samplebild als Gesicht zu interpretieren.

Stattdessen:

- Wenn kein signiertes Portrait vorhanden ist: Flow 4 wird sofort `budget_skipped` mit klarer Meldung.
- Wenn ein Portrait vorhanden ist, aber HeyGen `400127` meldet: weiterhin Soft-Skip, aber mit präziser Meldung: „Portrait vorhanden, aber HeyGen erkennt darin kein Gesicht; Bootstrap ersetzt das Portrait jetzt gezielt.“

### 4. Optionaler QA-Bypass nur für Asset-Verfügbarkeit vermeiden

Ich werde **nicht** einfach `x-qa-mock` für Talking Head setzen, weil der Deep Sweep echte Provider-Drift testen soll. Flow 4 soll nur grün werden, wenn HeyGen die echte Upload-/Create-Kette akzeptiert.

### 5. UI-Fixes in `DeepSweepTab.tsx`

Ich passe die Admin-Ansicht an:

- Der Bootstrap-Button erscheint auch bei Flow 4 `budget_skipped`/Portrait-Fehlern, nicht nur bei altem `flow_index === 7`.
- Text wird angepasst: „Bootstrap Assets aktualisiert. Portrait wird ersetzt; nächsten Run erneut starten.“
- `budget_skipped` Fehlertexte werden nicht rot wie harte Failures dargestellt, sondern neutral/amber, damit Skip ≠ Bug klarer ist.
- History-Passrate kann Timeouts analog zur aktuellen Karte separat darstellen, damit alte Runs nicht wieder irreführend rot/low aussehen.

## Erwartetes Ergebnis

Nach dem Fix und erneutem Bootstrap:

- `test-portrait.png` wird wirklich ersetzt bzw. neu provisioniert.
- Flow 4 nutzt eine Signed URL zum Portrait und nicht mehr das generische Testbild.
- Wenn HeyGen das Portrait akzeptiert, wird Flow 4 grün.
- Falls HeyGen trotzdem kein Gesicht erkennt, bleibt es ein sichtbarer Soft-Skip mit korrekter Diagnose, nicht ein verwirrender Hinweis „Bootstrap ausführen“, obwohl Bootstrap schon geklickt wurde.
- Flow 2 bleibt gelb `timeout`, solange AWS Lambda limitiert; das ist weiterhin Infrastruktur, nicht Code-Bug.