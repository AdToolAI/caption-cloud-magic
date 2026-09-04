# Picture Studio 2.0 — Topaz & Clarity in voller Tiefe

Ziel: Enhance liefert nicht nur "2× / 4× größer", sondern den vollen Funktionsumfang beider Premium-Engines — sichtbar, verständlich und ohne Bastel-Regler-Wüste. Grundsatz bleibt: erst die Aufgabe, dann das Modell; Profis bekommen alle Regler, Einsteiger einen guten Standard.

## 1. Verifizieren, bevor etwas sichtbar wird

Zuerst wird für jedes Topaz-Modell auf Replicate das echte Eingabe-Schema abgerufen (Parameternamen, erlaubte Werte, Grenzen) und protokolliert. Nur Modelle, die dabei bestätigt werden, kommen in die Auswahl. Erwartete Familie:

- Topaz Image Upscale (Foto-Vergrößerung, Gesichter, Text)
- Topaz Dust & Scratch (Restaurierung alter Fotos)
- Topaz Image Colorization (Schwarz-Weiß einfärben)
- weitere Topaz-Bildmodelle, sofern der Katalog sie führt (z. B. Rauschentfernung/Schärfung)

Bestätigt der Katalog ein Modell nicht, verschwindet es aus der Registry, statt eine hübsche, tote Karte zu zeigen.

## 2. Topaz Image Upscale — alles, was die Engine kann

Sichtbar in der Oberfläche:

- Enhance-Modelle mit echten Namen: Auto (zeigt "Selected: High Fidelity V2"), Standard V2, High Fidelity V2, Low Resolution V2, CGI, Text Refine
- Faktor 2× · 4× · 6× mit berechneter Ausgabegröße (`2048 × 1365 → 8192 × 5460`)
- Zielgröße alternativ als feste Breite/Höhe, wenn das Modell das unterstützt
- Gesichts-Verbesserung: an/aus, Stärke, unter "Erweitert" zusätzlich Kreativität
- Motiv-Erkennung, Schärfe/Rauschen und Ausgabeformat (PNG/JPG) unter "Erweitert"

Auto wählt das Enhance-Modell aus Bildmerkmalen (Auflösung, Textanteil, Gesichter, Grafik vs. Foto) und nennt die Wahl immer beim Namen — keine Black Box.

## 3. Clarity Pro — die volle Kreativ-Kontrolle

Heute nutzt das Studio nur einen Bruchteil. Neu freigelegt:

- Presets Faithful · Balanced · Ultra Detail (bleiben Standardweg)
- Detail-Kreativität und Ähnlichkeit zum Original als zwei getrennte Regler
- HDR/Dynamik, Schärfen, Rausch-/Detailschritte
- Optionaler Führungs-Prompt und Negativ-Prompt ("keine zusätzlichen Objekte")
- Handkorrektur, Kachelgröße und Startwert (Seed) für reproduzierbare Läufe
- Skalierung 2× und 4×, Ausgabeformat

Alles außer Preset, Faktor und den zwei Hauptreglern liegt zugeklappt unter "Erweiterte Einstellungen".

## 4. Restaurieren und Kolorieren als vollwertige Bereiche

- Restaurieren: Topaz Dust & Scratch mit Stärke und optionaler Filmkorn-Beibehaltung; danach direkt "Weiter mit Upscale".
- Kolorieren: Topaz Image Colorization mit Natürlich/Ausgewogen/Kräftig und Sättigungsregler; danach direkt "Weiter mit Upscale".
- Beide nutzen dieselbe Leinwand, denselben Vorher/Nachher-Vergleich, dieselbe Preisvorschau und denselben Verlauf.

## 5. Modelle vergleichen

"Topaz vs. Clarity Pro — beide auf deinem eigenen Bild vergleichen": ein Lauf startet beide Engines, das Ergebnis liegt in derselben Vergleichsansicht nebeneinander, mit Preis und Dauer je Engine. Das ist die stärkste Demonstration der Plattform und kommt direkt nach der stabilen Einzelnutzung.

## 6. Ketten statt Neustart

Unter jedem Ergebnis: Bearbeiten · Enhance · Hintergrund · Zum Album · Herunterladen, nach einem Upscale zusätzlich "Nochmals verbessern" mit der jeweils anderen Engine. Jeder Schritt landet im Verlauf; frühere Versionen bleiben jederzeit wählbar.

## 7. Preise und Freigabe

- Preis wird vor jedem Lauf exakt angezeigt: Modell, Ausgabegröße, Betrag, typische Dauer als Spanne.
- Topaz rechnet nach Ausgabe-Megapixeln, Clarity bleibt bei den heutigen Festpreisen (0,03 € / 0,06 €) — daran ändert sich nichts.
- Vor der Freischaltung: je Modell ein günstigster echter Testlauf, danach lege ich dir die Endpreise zur Freigabe vor.
- Kein Modell wird ausführbar, bevor ein echter Durchlauf inklusive Abbuchung, Rückerstattung im Fehlerfall, Mediathek und Download bestanden ist.

## 8. Reihenfolge

1. Schemas aller Topaz-Modelle abrufen und Registry darauf festziehen
2. Backend: eine Enhance-Funktion für alle Enhance-Modelle über die Adapter-Schicht (Guthaben, Rückerstattung, Speicherung, Mediathek)
3. Clarity vollständig auf die neue Kette migrieren (Preise unverändert)
4. Topaz Image Upscale mit allen Reglern hinter Flag
5. Echte Kosten-/Qualitätstests → Endpreise freigeben → Topaz aktivieren
6. Vergleich Topaz vs. Clarity
7. Dust & Scratch, danach Colorization
8. Auto-Empfehlung, Telemetrie zur typischen Laufzeit, Feinschliff

## Technische Details

- Registry (`src/config/pictureModels/`) beschreibt Fähigkeiten, Regler-Schema, Presets und Preise; sie baut keine Provider-Anfrage.
- Pro Modell ein Adapter (`src/lib/pictureModels/adapters/`), der das jeweilige Replicate-Payload erzeugt; Schemaänderungen des Anbieters treffen nur den Adapter.
- Neue Edge-Function `enhance-image` ersetzt schrittweise `upscale-image`; Lifecycle wie festgelegt (`provider_output_ready → asset_persisting → completed`, Rückerstattung nur bei echtem Provider-Fehler oder endgültig verlorenem Ergebnis).
- Regler werden aus dem Registry-Schema gerendert, kein Sonderfall pro Modell in React.
- Alle Texte EN/DE/ES.
