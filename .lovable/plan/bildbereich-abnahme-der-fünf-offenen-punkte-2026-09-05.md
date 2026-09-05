# Bildbereich — Abnahme der fünf offenen Punkte

## Was ich jetzt schon belegen kann (aus dem Code gelesen)

- **Format bleibt semantisch**: Die Formatwahl (`Source` oder ein Verhältnis) ist ein eigener Zustand, den ein Modellwechsel nicht überschreibt; nur die Auflösung fürs Modell wird neu berechnet. Ein automatischer Test dafür fehlt aber noch.
- **Source = Referenz 1**: Die Quellmaße werden ausschließlich beim Hochladen von Referenz 1 gemessen und beim Entfernen von Referenz 1 gelöscht. Zusatzreferenzen ändern das Format nie.
- **„Das wird genau gesendet"** sitzt aktuell direkt im Hauptflow (aufklappbarer Knopf unter den Hinweiskarten).

## Was noch nicht bestätigt ist

- Die zwei echten Live-Läufe sind noch nicht durchgeführt.
- Die Invarianz-Tests decken bisher nur ein Modell ab (Seedream/„fast"), nicht die ganze Modellpalette.
- Für Referenzen, die nicht per Datei-Upload, sondern aus der Bibliothek/dem aktiven Bild kommen, ist noch nicht geprüft, ob die Quellmaße genauso gesetzt werden.

## Vorgehen

### 1. Zwei echte Live-Läufe mit Vollprotokoll
- Lauf A (prompt-geführte Referenzstärke) und Lauf B (nativer Stärke-Parameter) — je ein Modell aus jeder Gruppe, mit identischem Prompt und identischer Referenz.
- Für jeden Lauf protokollieren: Auswahl in der Oberfläche → normalisierte Absicht auf dem Server → tatsächlicher Anbieter-Payload → Ergebnisbild.
- Abgleich, dass Oberfläche und Server dieselbe Bedeutung erzeugen (gleiche Stärkestufe, gleiches aufgelöstes Format, keine zusätzlichen Prompt-Bestandteile).
- Ergebnis als Protokolldatei unter `docs/` ablegen.

### 2. Formatwahl über Modellwechsel absichern
- Test: Source wählen, Modell A löst auf 3:2 auf, Wechsel zu Modell B mit exakten Maßen → Wunsch bleibt „Source", Modell B löst wieder aus den echten Quellmaßen auf, nie aus dem vorherigen 3:2.
- Zusätzlich als Oberflächentest (echter Klickpfad), nicht nur als Rechenfunktion.

### 3. Quellbild deterministisch an Referenz 1 binden
- Prüfen und, falls nötig, ergänzen: Referenzen aus Bibliothek/aktivem Bild messen ebenfalls nur Referenz 1.
- Test mit drei Referenzen unterschiedlicher Seitenverhältnisse in wechselnder Reihenfolge → das Format folgt immer Referenz 1.

### 4. Vollständige Modell-Invarianz-Matrix
Für jedes aktive Modell (Gemini, Seedream, Nano Banana, Imagen, GPT-Image-2, Ideogram, Recraft, FLUX, Qwen) je Fall:
- Stil „Auto" → kein Stil-Zusatz im Prompt
- keine Referenz → kein Stärke-/Guidance-Wert im Payload
- Source → nie stilles 1:1, immer sichtbarer Anpassungshinweis
- Modellwechsel → semantische Auswahl bleibt, Anbieterwerte werden neu erzeugt

### 5. „Das wird genau gesendet" verschieben
- Der Hauptflow zeigt künftig nur: Prompt · Modell · Veränderungsstärke · Stil · Format.
- Die vollständige Aufschlüsselung zieht in einen zugeklappten Bereich „Erweitert → Prompt-Details" (EN/DE/ES), standardmäßig geschlossen, Inhalt unverändert.

### 6. Abschluss
Exakte Ergebnisse nennen: Testlauf (Anzahl bestanden/gesamt), Typprüfung, Build.

## Technische Details

- Tests: Erweiterung von `src/test/pictureIntentMatrix.test.ts` (Schleife über alle Tiers aus `PICTURE_MODEL_CAPABILITIES`) plus neuer Fall für Modellwechsel; Oberflächentests für Referenz-1-Bindung.
- Live-Läufe über die bestehenden Edge Functions `generate-image-replicate` / `generate-studio-image`; Payload-Vergleich aus Function-Logs und `metadata_json` (`requestedFormat`/`resolvedFormat`).
- UI-Änderung nur in `src/components/picture-studio/ImageGenerator.tsx` (Collapsible in einen „Erweitert"-Abschnitt einsortieren), keine Änderung an Preis-, Wallet- oder Generierungslogik.
