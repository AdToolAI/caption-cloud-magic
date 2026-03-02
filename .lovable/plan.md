
Zielbild
- Ja, es gibt weiterhin einen Weg, die volle Videoqualität (Lottie-Charaktere + Icons + Transitions) zu behalten und den Fehler gleichzeitig sauber zu beheben.
- Nach der Analyse ist klar: Der zuletzt gefixte Enum-Teil (`category` / `storytellingStructure`) ist jetzt korrekt, aber nicht die alleinige Ursache.

Do I know what the issue is?
- Ja, mit hoher Wahrscheinlichkeit ist es ein kombiniertes Problem aus:
  1) verbleibenden Input-Shape-Risiken im Payload (nicht nur die 2 bekannten Enums), und
  2) möglichem Bundle-Drift (Render-Lambda nutzt noch nicht sicher den aktuell gehärteten Remotion-Bundle-Stand).

Was ich konkret verifiziert habe
- Letzter fehlgeschlagener Run nutzt bereits:
  - `category: "social-reel"`
  - `storytellingStructure: "hook-problem-solution"`
  - `characterType: "lottie"`
- Trotzdem identischer Crash: `Cannot read properties of undefined (reading 'length')` im Lambda-Stack.
- Das bestätigt: Enum-Fix war notwendig, aber nicht ausreichend.

Umsetzung (qualitäts-erhaltend, kein dauerhaftes Downgrade)

1) InputProps vollständig „schema-safe“ machen (harte Sanitization vor Lambda)
- Datei: `supabase/functions/auto-generate-universal-video/index.ts`
- Änderungen:
  - Neue zentrale Builder-Funktion, die ALLE schema-relevanten Felder strikt validiert (nicht nur `category` / `storytellingStructure`).
  - `null`-Werte für optionale Schemafelder nicht senden (bei optionalen Feldern nur `undefined`/Weglassen).
  - Szenenfelder mit Enum-Mapping absichern:
    - `animation`
    - `kenBurnsDirection`
    - `textAnimation`
    - `transition.type`
    - `textOverlay.position`
    - `type/sceneType`
  - `beatSyncData` nur senden, wenn mindestens `bpm`, `transitionPoints`, `downbeats` valide Arrays/Numbers sind.
- Effekt:
  - Zod-/Shape-Risiken werden vor dem Render eliminiert.

2) Starke Forensik im Payload ergänzen (ohne Qualität zu reduzieren)
- Datei: `supabase/functions/auto-generate-universal-video/index.ts`
- Änderungen:
  - `inputPropsDiagnostics` als kompakter Block in DB speichern (validierte Enum-Werte, Feld-Präsenz, Null-Counts).
  - Hash/Fingerprint des finalen `inputProps.payload` speichern.
- Effekt:
  - Bei erneutem Fehler ist sofort sichtbar, ob es ein Datenproblem oder Bundle-Problem ist.

3) Bundle-Drift eindeutig nachweisen (Canary-Marker)
- Dateien:
  - `src/remotion/templates/UniversalCreatorVideo.tsx`
  - optional `src/remotion/Root.tsx`
- Änderungen:
  - Ein klarer, versionierter Canary-Log am Frame 0 (z. B. `UCV_BUNDLE_CANARY=2026-03-02-r3`).
- Effekt:
  - In Render-Logs ist eindeutig prüfbar, ob wirklich der aktuelle Bundle-Code läuft.

4) Qualitätsmodus als Standard beibehalten, Fallback nur als kontrollierter Retry
- Datei: `supabase/functions/auto-generate-universal-video/index.ts`
- Änderungen:
  - Standard bleibt `characterType: 'lottie'`, keine dauerhafte Scene-Remaps.
  - Optionaler Retry-Mechanismus nur bei genau diesem bekannten Runtime-Fehler:
    - 1. Versuch: Full Quality (Lottie aktiv)
    - 2. Versuch (nur wenn nötig): Safe-Fallback
- Effekt:
  - Qualität bleibt im Normalfall unverändert hoch; Stabilitätsnetz nur im Fehlerfall.

5) Validierungs- und Abnahmepfad (verbindlich)
- Test 1: Frischer Run mit Full Quality
  - Erwartung: `completed`, ausspielbares Video, Lottie sichtbar.
- Test 2: Diagnose prüfen
  - Payload-Diagnostics + Canary vorhanden.
- Test 3: Negativtest (simuliert invalider Enum/Field)
  - Erwartung: Sanitizer korrigiert vor Lambda, kein Hard-Crash.
- Test 4: Nur falls weiterhin Fehler
  - Retry-Fallback aktivieren und prüfen, ob Run stabil durchläuft.

Erwartetes Ergebnis
- Primärziel: volle Qualität bleibt erhalten (kein permanenter SVG-Downgrade).
- Der Renderpfad wird robust gegen fehlerhafte Input-Varianten.
- Wenn weiterhin ein Fehler auftritt, ist die Ursache durch Canary + Diagnostics sofort eindeutig (Daten vs. Bundle).

Technischer Fokus (kurz)
- Höchster Hebel jetzt: strict payload sanitation + bundle-canary observability.
- Danach erst gezielte Fallback-Strategie, nicht umgekehrt.
