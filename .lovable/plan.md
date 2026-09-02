# V541 — Clip-1/4-Abbruch und Run-spezifischer Fortschritt

## Bestätigter Produktionsbefund

- Betroffener Lauf: `77aa1f2e-e9ec-4830-ad42-19771e11c1a9`, Szene `7aa7fc93-bfd5-49a1-809e-40f29459b963`, Plate-Generation 5.
- Pass 1 wurde erfolgreich erstellt und mit HTTP 201 an den Lip-Sync-Anbieter übergeben.
- Pass 2 und 3 wurden vor jedem Anbieter-Aufruf durch `v536_mouth_crop_infeasible` beendet; deshalb stoppte der Gesamtlauf nach „Clip 1/4“.
- Der V536-Log enthält `face=n/a`, `band=n/a`, `interval=[NaN,NaN]`. Diese Form entsteht ausschließlich im nachgelagerten Render-Cadence-Recheck, nicht bei einer bewiesenen leeren Face/Mouth/Plate-Schnittmenge.
- Die Nachprüfung verwirft aktuell nur mit einem generischen Mouth-Infeasible-Verdikt; sie verliert dabei `failedKind` (`face` oder `mouth`) und die gemessene Margin. Damit ist aus dem Produktionsartefakt keine echte geometrische Unmöglichkeit bewiesen.
- V540 zeigt zusätzlich für Pass 1 sechs erfolgreiche Frame-Extraktionen mit je zwei Gesichtern, aber `no_identity_safe_match` in allen sechs Samples. Dieser Track-Ausfall degradierte dort korrekt auf den statischen Pfad und war nicht der Abbruchgrund.

## Umsetzung

1. **V536-Recheck reparieren, ohne Sicherheitsgate zu lockern**
   - Den Render-Cadence-Recheck so korrigieren, dass eine durch Rundung/Even-Snap/Keyframe-Reduktion verletzte Bahn deterministisch auf die bereits berechnete zulässige Geometrie zurückgeführt wird.
   - Face-, Mouth- und Plate-Containment bleiben unverändert; kein Epsilon, kein Schwellenwert-Absenken und kein Full-Plate-Fallback.
   - Nur wenn auch die korrigierte Bahn keine zulässige Geometrie besitzt, bleibt der bestehende fail-closed Abbruch aktiv.

2. **Verdikt beweiskräftig machen**
   - Bei verbleibender Unmöglichkeit `failedKind`, Margin, tatsächliche Face-/Mouth-Werte und Intervalle erhalten statt pauschal `axis=x` plus `NaN` zu schreiben.
   - Keine URLs, Bilder oder personenbezogenen Daten in die Telemetrie aufnehmen.

3. **Fortschrittsanzeige vollständig auf den aktuellen Run begrenzen**
   - Den begonnenen V539-Fix auf Run/Epoche und `clipScope` stützen, damit alte Szenenfehler einen aktiven Re-Render nicht rot färben und Prozent sowie Zeit sichtbar bleiben.
   - Rot/„Lip-Sync abgebrochen“/„Sauber neu starten“ erst anzeigen, wenn der aktuelle Lauf selbst terminal fehlschlägt.

4. **V540-Diagnostik beibehalten**
   - Die additive Track-Diagnostik bleibt fail-open und wird durch einen Redaktions-/Nichtbeeinflussungstest abgesichert.
   - Die separate Ursache `no_identity_safe_match` wird nicht in diesem Gate durch Lockerung der Identitätslogik behoben.

## Technische Dateien

- `supabase/functions/_shared/dynamic-camera-path.ts`
- `supabase/functions/_shared/mouth-crop-feasibility.ts`
- `supabase/functions/_shared/v536-mouth-crop-containment.test.ts`
- `src/hooks/usePipelineProgress.ts`
- passende fokussierte Progress-Tests
- `supabase/functions/compose-dialog-segments/index.ts` nur für die bereits additive V540-Telemetrie und deren Test, keine Dispatch-Änderung

## Verifikation

- Regressionsfixture für den beobachteten Post-Recheck-Fall: zulässige dichte Bahn bleibt nach Materialisierung zulässig und wird nicht als `dynamic_mouth_crop_infeasible` fehlklassifiziert.
- Echte unmögliche Face/Mouth/Plate-Geometrie bleibt fail-closed und erzeugt keinen Anbieter-Aufruf.
- Bestehende V536-, V461-, V464- und Frozen-Contract-Suiten bleiben grün.
- Progress-Tests: alter Szenenfehler + aktiver neuer Run zeigt Prozent/ETA; Fehler des aktuellen Runs zeigt den roten Terminalzustand.
- Danach genau die betroffenen Backend-Funktionen deployen; kein Frontend-Publish und kein bezahlter Testlauf durch den Agenten. Ein späterer realer 2-Personen-Lauf muss vier Dispatches oder einen beweiskräftigen echten Geometrieabbruch zeigen.
