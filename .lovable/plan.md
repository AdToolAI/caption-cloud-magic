
Aktueller Stand (neu validiert):
- Der Transport-/Scheduling-Teil ist jetzt stabil (Invocation 200, echte Render-ID, korrekte Scheduling-Felder).
- Der Crash passiert weiterhin im Remotion-Lambda selbst mit:
  - `TypeError: Cannot read properties of undefined (reading 'length')`
  - Stack nur aus gebündeltem Runtime-Code (`/var/task/index.js`), also ein Render-/Input-Datenproblem.

Was ich zusätzlich isoliert habe:
- In `UniversalCreatorVideo` werden bei `solution`/`cta` Szenen immer `MorphTransition`-Effekte gerendert.
- `MorphTransition.tsx` lädt Lottie-JSON und übergibt es aktuell **ohne Validierung** direkt an `<Lottie />`.
- Die letzte Fix-Runde hat Lottie-Guards in `LottieIcons` und `ProfessionalLottieCharacter` ergänzt, aber **nicht** in `MorphTransition`.
- Das passt exakt zum Fehlerbild „reading 'length'“ aus Lottie-Runtime, wenn die JSON-Struktur nicht vollständig dem erwarteten Format entspricht.

Do I know what the issue is?
- Ja, mit hoher Wahrscheinlichkeit: Es gibt noch mindestens einen ungeschützten Lottie-Pfad (`MorphTransition`), über den weiterhin inkompatible/teilweise Lottie-Daten in den Renderer gelangen können.

Exaktes Problem:
- Die Datenintegrität für Lottie ist nicht durchgängig. Einzelne Komponenten validieren bereits, aber `MorphTransition` nicht.
- Dadurch kann weiterhin ein fehlerhaftes JSON-Objekt bei `@remotion/lottie` landen, was typischerweise in internen `.length`-Zugriffen crasht.

Umsetzungsplan (gezielt, kleinster sicherer Fix zuerst):

1) Lottie-Guard in `MorphTransition` nachziehen (Hauptfix)
- Datei: `src/remotion/components/MorphTransition.tsx`
- Änderungen:
  - `isValidLottieData` aus `premiumLottieLoader` importieren.
  - Nach `response.json()` strikt validieren.
  - Bei invaliden Daten: **kein** `setAnimationData(data)`, stattdessen `setUseFallback(true)` (SVG-Transition).
  - Vor `<Lottie />` zusätzlich Runtime-Guard: nur rendern, wenn Daten gültig sind.
- Effekt:
  - Der aktuell wahrscheinlich verbleibende Crash-Pfad wird geschlossen.

2) Validierungslogik zentral schärfen (Defensive Hardening)
- Datei: `src/remotion/utils/premiumLottieLoader.ts`
- Änderungen:
  - Guard erweitern um optionale Top-Level-Felder, die als Arrays erwartet werden können (z. B. `assets`, `markers`) bzw. fehlende Felder robust behandeln.
  - Optional: kleine Normalisierung (fehlende optionale Arrays auf `[]` setzen), bevor Daten in Komponenten landen.
- Effekt:
  - Weniger Risiko, dass formal „halb-gültige“ JSONs den Renderer destabilisieren.

3) Einheitliche Nutzung der zentralen Guard-Funktion
- Dateien:
  - `src/remotion/components/LottieIcons.tsx`
  - `src/remotion/components/ProfessionalLottieCharacter.tsx`
  - optional `src/remotion/components/LottieCharacter.tsx` (für Konsistenz)
- Änderungen:
  - Sicherstellen, dass überall dieselbe strikte Validierung + identisches Fallback-Verhalten gilt.
- Effekt:
  - Keine „blinden Flecken“ mehr zwischen verschiedenen Lottie-Komponenten.

4) Kurzfristiger Stabilitäts-Schalter (nur falls nach Schritt 1 noch Fehler)
- Dateien:
  - `src/remotion/templates/UniversalCreatorVideo.tsx`
  - `supabase/functions/auto-generate-universal-video/index.ts`
- Änderung (Fallback-Plan):
  - Temporär Lottie-Transitionen/Character in den sicheren SVG/Emoji-Pfad zwingen (nur Render-Stabilität priorisieren).
- Effekt:
  - Garantiert renderbare Ausgabe auch bei externen Lottie-Quellenproblemen.

5) Forensik-Logs präzisieren (einmalig)
- Dateien:
  - `src/remotion/components/MorphTransition.tsx`
  - `src/remotion/components/ProfessionalLottieCharacter.tsx`
- Loggen:
  - Quelle/Typ der Lottie-Datei, `isValid=true/false`, Fallback-Entscheidung.
- Effekt:
  - Beim nächsten Fehler sofort sichtbar, welche Komponente und welche Datenquelle betroffen war.

Validierung nach Umsetzung:
1. Frischen Universal-Run starten (kein Retry).
2. Erwartung:
   - `invoke-remotion-render` bleibt erfolgreich.
   - Kein Webhook-Fehler `reading 'length'`.
   - Status läuft auf `completed`.
3. E2E-Check:
   - UI-Progress, Endstatus, finaler Video-Link und Abspielbarkeit prüfen.
4. Negativtest:
   - Eine Lottie-Quelle absichtlich ungültig simulieren -> Render muss mit SVG/Emoji-Fallback weiterlaufen, ohne Crash.

Technische Notiz:
- Ich beginne bewusst mit `MorphTransition`, weil das der aktuell offensichtlich verbleibende ungeschützte Lottie-Einstiegspunkt im Universal-Renderpfad ist und direkt zu eurem Fehlerprofil passt.
