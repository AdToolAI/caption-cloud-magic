# Topaz-Hochskalierung: Warum das Bild klein bleibt

## Geprüft am echten Konto (yaxac88729@watchyio.com)

Die drei letzten Läufe wurden direkt an den fertigen Dateien nachgemessen:

| Lauf | Ausgangsmaterial | Gewählt | Tatsächliches Ergebnis | Datei |
|---|---|---|---|---|
| Topaz | 1080×1920, 17 s | „4K" | **1216×2160** (HEVC, 7,4 Mbit/s) | 16,1 MB |
| Topaz | 720×1280, 10 s | „4K" | **1216×2160** (HEVC, 4,9 Mbit/s) | 6,3 MB |
| ByteDance | 1080×1920, 17 s | „4K" | **2160×3840** (H.264, 21 Mbit/s) | 45,4 MB |

Daraus folgt eindeutig:

1. **Topaz läuft und liefert ab** — der Motor ist nicht kaputt.
2. **Topaz rechnet „4K" auf die lange Seite.** Bei Hochkant-Videos landet die
   Zahl 2160 auf der Höhe. Aus 1080×1920 wird deshalb 1216×2160 — die Breite
   wächst nur um 13 %. Gefühlt passiert also fast nichts, und genau das hat die
   Kundin gesehen. ByteDance behandelt Hochkant richtig und liefert 2160×3840.
3. **Die MB-Zahl ist kein Fehler, sondern die Folge davon**: viermal weniger
   Bildpunkte plus das modernere, sparsamere Kompressionsverfahren (HEVC statt
   H.264). Bei gleicher Bildqualität ergibt HEVC deutlich kleinere Dateien.
4. **Niemand konnte das vorher sehen.** Die Felder für die tatsächliche
   Ausgabegröße bleiben bei allen aktuellen Läufen leer — das Ergebnis wird nach
   dem Lauf nie nachgemessen, also zeigt die Oberfläche nur das Wunschziel.

## Was gebaut wird

### 1. Ehrliche Zielgröße vor dem Start
Statt nur „4K" steht künftig die echte Ausgabegröße für genau dieses Video da,
z. B. „1080×1920 → 1216×2160". Bei Hochkant-Material mit Topaz erscheint
zusätzlich der Hinweis, dass Topaz die Zahl auf die lange Seite legt, plus ein
Ein-Klick-Wechsel auf den Motor, der echtes Hochkant-4K liefert (2160×3840).

### 2. Warnung statt Fehlkauf
Wenn die Rechnung ergibt, dass die kurze Seite um weniger als ~25 % wächst
(der Fall 1080 → 1216), wird der Start nicht stillschweigend zugelassen: es
kommt eine klare Meldung „bringt bei diesem Video kaum Zuwachs" mit dem
empfohlenen Alternativweg. Starten bleibt möglich, aber bewusst.

### 3. Ergebnis nachmessen und anzeigen
Nach jedem Lauf werden Auflösung, Bildrate, Datenrate und Dateigröße der
fertigen Datei gemessen, gespeichert und im Ergebnisfenster sowie in der
Mediathek angezeigt — inklusive Vergleich „vorher → nachher". Weicht das
Ergebnis vom versprochenen Ziel ab, ist das sofort sichtbar.

### 4. Erklärung zur Dateigröße
Neben der Größe steht künftig das Kompressionsverfahren und die Datenrate. Ein
kurzer Hinweis erklärt, dass eine kleinere Datei bei HEVC nicht weniger
Bildqualität bedeutet. (Kein Neu-Kodieren — die Datei bleibt exakt so, wie der
Anbieter sie geliefert hat.)

## Technische Details

- `supabase/functions/_shared/video-enhance-models.ts`: neue reine Funktion
  `projectOutputSize(spec, config, source)` — Topaz = Zielzahl auf die Höhe,
  ByteDance = Zielbox seitenrichtig gedreht (durch die gemessenen Läufe oben
  belegt). Ergebnis fließt in `projected_width/height/projection_strategy`.
- `supabase/functions/video-enhance/index.ts`: `estimate` liefert die Projektion
  mit; nach dem Persistieren wird das Ergebnis mit `probeRemoteVideo` gemessen
  und in `actual_width/actual_height/projection_matched` geschrieben (Spalten
  existieren bereits, werden aktuell nicht befüllt). Zusätzlich Datenrate,
  Codec und Größe in den Run-Metadaten.
- `src/components/ai-video/EnhanceVideoPanel.tsx`: Anzeige „Quelle → Ergebnis",
  Gewinn-Warnung unter Schwelle 1,25× auf der kurzen Seite, Motorempfehlung
  bei Hochkant; Ergebnisblock zeigt gemessene Werte.
- `src/config/videoEnhanceModels/*`: gespiegelte Projektionsfunktion, Paritäts-
  test wird um die Projektion erweitert.
- Neuer Test `src/test/videoEnhanceProjection.test.ts` mit genau den drei oben
  gemessenen Läufen als Fixtures.
- Unangetastet: Preislogik, Deckel, Gutschrift, Wallet, Provideraufrufe,
  Director's Cut, Lip-Sync.

## Prüfung vor Abgabe

- Die drei realen Läufe der Kundin werden gegen die Projektion nachgerechnet
  (erwartet: 1216×2160, 1216×2160, 2160×3840 — Treffer).
- Ein Hochkant-Testlauf über beide Motoren, Anzeige und gemessene Ausgabe
  müssen übereinstimmen.
- EN/DE/ES für alle neuen Texte, Typecheck, Tests.
