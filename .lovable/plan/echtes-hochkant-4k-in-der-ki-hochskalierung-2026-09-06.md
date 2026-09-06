# Echtes Hochkant-4K in der KI-Hochskalierung

## Geprüft am Konto der Kundin (yaxac88729@watchyio.com)

Die letzten Läufe wurden direkt an den fertigen Dateien nachgemessen:

| Lauf | Ausgangsmaterial | Gewählt | Tatsächliches Ergebnis | Datei |
|---|---|---|---|---|
| Topaz | 1080×1920, 17 s | „4K" | **1216×2160** (HEVC, 7,4 Mbit/s) | 16,1 MB |
| Topaz | 720×1280, 10 s | „4K" | **1216×2160** (HEVC, 4,9 Mbit/s) | 6,3 MB |
| ByteDance | 1080×1920, 17 s | „4K" | **2160×3840** (H.264, 21 Mbit/s) | 45,4 MB |

Befund:

1. **Topaz arbeitet, ist aber querformat-gedacht.** Die Zahl 2160 landet immer
   auf der Höhe. Bei einem Hochkant-Video wird aus 1080 Breite nur 1216 — also
   praktisch kein Zuwachs. Genau das sieht die Kundin.
2. **Die kleine MB-Zahl ist die Folge davon**: viermal weniger Bildpunkte plus
   das sparsamere Verfahren HEVC. ByteDance liefert am selben Video echtes
   2160×3840 und damit 45 MB.
3. **Es wird nie nachgemessen.** Die Felder für die tatsächliche Ausgabegröße
   sind bei allen aktuellen Läufen leer — die Oberfläche zeigt nur den Wunsch.

## Was gebaut wird

### 1. Zugesagte Bildgröße statt Etikett
„4K" bedeutet künftig verbindlich **3840 auf der langen und 2160 auf der kurzen
Seite** — bei Hochkant also 2160×3840, bei Querformat 3840×2160. Dasselbe für
2K und 1080p. Was zugesagt wird, wird geliefert; kein Umschalt-Hinweis, keine
Ausweichempfehlung.

### 2. Hochkant-Weg für Topaz
Ist das Video hochkant und Topaz gewählt, dreht das System das Material vor der
Bearbeitung um 90°, lässt Topaz auf volle 2160 Höhe rechnen und dreht das
Ergebnis danach zurück. Ergebnis: echte 2160×3840 aus Topaz. Der Dreh-Durchgang
läuft verlustarm mit hoher Datenrate, damit nichts an Qualität verloren geht.

Das kostet mehr, weil Topaz dann die vierfache Bildfläche rechnet — der Preis
steht vollständig und vorab in der Oberfläche, inklusive Hinweis, dass Hochkant
den größeren Rahmen und damit den höheren Preis bedeutet.

### 3. Ergebnis nachmessen und zeigen
Nach jedem Lauf werden Auflösung, Bildrate, Verfahren, Datenrate und Größe der
fertigen Datei gemessen, gespeichert und angezeigt („1080×1920 → 2160×3840").
Trifft das Ergebnis die Zusage nicht, ist das sofort sichtbar und der Lauf gilt
als nicht erfüllt (mit automatischer Gutschrift über den bestehenden Weg).

### 4. Dateigröße erklärt
Neben der Größe stehen Verfahren und Datenrate, mit einem kurzen Hinweis, dass
eine kleinere Datei bei HEVC nicht weniger Bildqualität bedeutet. Die Datei
selbst wird nicht künstlich aufgebläht.

## Technische Details

- `supabase/functions/_shared/video-enhance-models.ts`
  - `resolveTargetFrame(resolution, sourceWidth, sourceHeight)` → seitenrichtige
    Zielbox (kurze Seite = 2160 bei 4K).
  - `planRun(spec, config, source)` liefert `{ providerInput, rotate: boolean,
    projectedWidth, projectedHeight, billedOutputPixels }`. Für Topaz +
    Hochkant ist `rotate = true`; Preis rechnet dann auf der gedrehten
    Ausgabefläche (bestehende Rate-Card, keine neue Preislogik).
- Neue Funktion `supabase/functions/video-rotate/index.ts`: zwei Aufrufe
  (vorher/nachher) über die schon im Projekt genutzte ffmpeg-Ausführung
  (`transform-media` als Vorbild), `transpose=1` bzw. `transpose=2`,
  `-c:v libx264 -crf 14 -preset veryfast`, Audio unverändert kopiert. Ablage im
  bestehenden Bucket unter `user_id/video-enhance/tmp/`.
- `supabase/functions/video-enhance/index.ts`
  - `estimate` gibt Zielrahmen, Dreh-Weg und Preis zurück.
  - `start`: optionaler Dreh-Vorlauf → Providerlauf → optionaler Rückdreh →
    Nachmessung via `probeRemoteVideo` → `actual_width/height`,
    `projection_matched`, Codec/Datenrate/Größe in die Run-Metadaten.
  - Schlägt einer der Dreh-Schritte fehl, wird der Lauf als Fehler
    terminalisiert und die bestehende idempotente Gutschrift greift.
- `src/config/videoEnhanceModels/*` + `src/lib/videoEnhance/rates.ts`:
  gespiegelte Zielrahmen-/Preisrechnung, Paritätstest erweitert.
- `src/components/ai-video/EnhanceVideoPanel.tsx`: „Quelle → Ergebnis" mit
  konkreten Pixeln, Hochkant-Preishinweis, gemessene Ergebniswerte, Texte in
  EN/DE/ES.
- Neuer Test `src/test/videoEnhanceTargetFrame.test.ts` mit den drei oben
  gemessenen Läufen als Fixtures.
- Unangetastet: Preisdeckel und Gutschriftlogik, Wallet, Director's Cut,
  Lip-Sync, Rohmaterial-Invariante.

## Risiko, offen benannt

Der Dreh-Durchgang läuft in der Cloud-Funktion; bei sehr langen 4K-Clips kann
die Laufzeit knapp werden. Deshalb wird der Weg zunächst bis 60 Sekunden
Videolänge freigegeben und beim Testlauf mit dem 17-Sekunden-Clip der Kundin
gemessen. Reicht das Zeitfenster nicht, wandert der Dreh-Schritt auf denselben
Lambda-Weg wie die Exporte — ohne Änderung an der Oberfläche oder am Preis.

## Prüfung vor Abgabe

- Der 17-Sekunden-Clip der Kundin über Topaz: erwartet 2160×3840, gemessen per
  ffprobe, Preis- und Guthabenanzeige geprüft.
- Querformat-Testlauf: unverändertes Verhalten (3840×2160).
- ByteDance-Lauf: weiterhin 2160×3840, keine Doppeldrehung.
- EN/DE/ES, Typecheck, Tests.
