# Warum der 10-Sekunden-Export so lange dauerte — Befund und Fix

## Was die Daten zeigen (Konto yaxac88729@watchyio.com)

Acht Exporte am 6. September, alle erfolgreich, alle über denselben Weg: **Director's Cut → Export (AWS Remotion Lambda)**. Jedes Video war ~10 Sekunden lang, eine Szene, ohne Effekte, ohne Premium-Funktionen — also ein reiner Durchreiche-Export.

| Uhrzeit (UTC) | Format / Qualität | Dauer bis fertig |
| --- | --- | --- |
| 03:51 | 9:16, 4K, 24 fps | 4:53 |
| 03:56 | 16:9, HD, 30 fps | 1:22 |
| 04:09 | 9:16, 4K, 24 fps | 4:55 |
| 04:10 | 9:16, 4K, 24 fps | 8:53 |
| 04:27 | 9:16, "8K", 24 fps | 1:51 |
| 04:32 | 9:16, 4K, 24 fps | 9:59 |
| 04:42 | 9:16, 4K, 24 fps | 4:52 |
| 05:09 | 16:9, HD, 30 fps | 2:25 |

Die Ursache ist eindeutig: **Nicht die Videolänge, sondern die 4K-Einstellung.** HD-Exporte lagen bei 1–2,5 Minuten, 4K-Exporte bei 5–10 Minuten — bei identischer Länge und identischem Inhalt.

Drei Verstärker dafür:

1. **Zu wenig Parallelität bei kurzen Clips.** Ein 10-Sekunden-Clip hat 241 Bilder. Die Aufteilungsregel gibt jedem Arbeiter mindestens 120 Bilder — also laufen faktisch nur 2 statt der erlaubten 3 Arbeiter. Bei 4K ist genau das der Flaschenhals.
2. **Höchste Qualitätsstufe der Kodierung fest verdrahtet** (verlustfreie Einzelbilder, langsamste Encoder-Voreinstellung). Das ist bei 3840×2160 pro Bild um ein Vielfaches teurer als bei 1080p — und bei einem Export ohne jede Bildbearbeitung überwiegend unnötig.
3. **Die Auswahl "8K" existiert im Backend gar nicht.** Alles außer "4K" wird auf 1080p abgebildet — der 04:27-Lauf lief also in Wahrheit als HD. Das erklärt die 1:51 und ist ein echter Fehler: Der Kunde bekommt nicht, was er auswählt.

Zusätzlich: Der Fortschrittsbalken stand laut Screenshot bei 85 % mit "Estimated remaining <1s", während der Lauf noch Minuten brauchte. Die Restzeit-Anzeige ist damit irreführend.

## Was ich umsetzen möchte

1. **Kurze Clips auf 6 Arbeiter verteilen** — die Mindestgröße pro Arbeiter entfällt für kurze Exporte, und die Obergrenze steigt von 3 auf 6. Ein 10-Sekunden-Clip (241 Bilder) läuft dann in 6 Teilen à ~40 Bildern statt in 2 Teilen à 120. Erwartung: 4K-Export etwa dreimal schneller, also rund 2 statt 6–10 Minuten. Kosten bleiben gleich (abgerechnet wird Rechenzeit, nicht Anzahl der Arbeiter).
   Kapazitäts-Hinweis: Heute liegt das AWS-Limit bei 100 gleichzeitigen Lambdas, davon 60 im Render-Topf. Mit 6 Arbeitern pro kurzem Export laufen 10 parallele Exporte statt 20 — für die aktuelle Nutzerzahl unkritisch, und die Aufnahmesperre schützt weiterhin vor Überlast. Sobald das erhöhte Limit (500+) freigegeben ist, ziehen wir Topf und Stufen in einem separaten Schritt nach oben (z. B. 8–12 Arbeiter für kurze Exporte).
2. **Encoder-Voreinstellung an die Auflösung koppeln** — bei 4K eine schnellere Encoder-Stufe, HD bleibt exakt wie heute. Die Regel "Rohmaterial bleibt pixelgleich" bleibt unangetastet: verlustfreie Einzelbilder und Farbraum-Kennzeichnung bleiben, nur die Encoder-Geschwindigkeitsstufe ändert sich.
3. **8K bleibt — aber echt** — heute ist "8K" nur ein Etikett: Alles außer "4K" landet im Backend bei 1080p. Der 04:27-Lauf mit 1:51 war deshalb kein 8K, sondern HD; er taugt nicht als Zeitmaßstab. Wir ergänzen das Auflösungs-Mapping um echtes 8K (7680×4320 bzw. 4320×7680 im Hochformat) plus einen klaren Zeit- und Dateigrößen-Hinweis in der Auswahl. Grenze: 8K nur für kurze Clips (bis ~30 Sekunden), sonst läuft der Renderdienst in sein 10-Minuten-Zeitlimit pro Arbeiter.
4. **Ehrliche Wartezeit-Anzeige** — Fortschritt springt nicht mehr auf 85 % mit "<1s"; stattdessen verstrichene Zeit plus typische Dauer für die gewählte Qualität, und ein Hinweis, dass 4K/8K deutlich länger dauern als HD.
5. **Nachmessen** — nach der Änderung je ein 10-Sekunden-Testexport in HD, 4K und 8K, Zeiten dokumentiert, Ergebnis visuell gegen einen heutigen Export geprüft (keine Qualitätsverschlechterung).

## Erwartete Renderzeiten mit 6 Arbeitern

Grundlage: Ein 10-Sekunden-Clip mit 24 fps hat 241 Bilder. Heute laufen daraus 3 Pakete à 120 Bildern; künftig 6 Pakete à ~40 Bildern. Parallel beschleunigt wird nur die Bildberechnung; Start, Zusammenfügen und Hochladen (~30–45 Sekunden) bleiben gleich.

| Lauf | Qualität | heute gemessen | Erwartung mit 6 Arbeitern |
| --- | --- | --- | --- |
| 03:51 | 4K 9:16 | 4:53 | ~2:40 |
| 04:09 | 4K 9:16 | 4:55 | ~2:40 |
| 04:10 | 4K 9:16 | 8:53 | ~4:40 |
| 04:32 | 4K 9:16 | 9:59 | ~5:15 |
| 04:42 | 4K 9:16 | 4:52 | ~2:40 |
| 03:56 | HD 16:9 | 1:22 | ~1:00 |
| 05:09 | HD 16:9 | 2:25 | ~1:30 |
| 04:27 | als "8K" gewählt, real HD | 1:51 | ~1:15 (als HD) |

Echtes 8K, das es bisher nicht gab: Es hat viermal so viele Bildpunkte wie 4K. Mit 6 Arbeitern rechne ich bei 10 Sekunden mit **etwa 8–11 Minuten**. Das ist die ehrliche Erwartung, die wir dem Kunden in der Auswahl auch anzeigen. Die Streuung zwischen den 4K-Läufen (4:52 bis 9:59 bei gleichem Material) kommt von AWS-Kaltstarts und parallel laufenden Renderaufträgen — die Zahlen oben sind Erwartungswerte, keine Garantien.

## Technische Details

- `supabase/functions/_shared/render-concurrency.ts`: Stufe `short` → `maxWorkers: 6`, `framesPerLambda = max(40, ceil(frames / 6))`; `FRAMES_PER_LAMBDA_MIN` gilt für diese Stufe nicht mehr. Andere Stufen unverändert. `estimateWorkersFromDuration` folgt automatisch, damit die Warteschlange richtig rechnet.
- `supabase/functions/render-directors-cut/index.ts`: `x264Preset` abhängig von der Zielhöhe (`>= 2160` → `medium`, sonst `slow`); `imageFormat: 'png'`, `colorSpace: 'bt709'`, `crf: 16` bleiben. Auflösungs-Mapping um `8k` ergänzt (16:9 7680×4320, 9:16 4320×7680, 1:1 4320×4320) inkl. Längenbegrenzung für 8K; `videoBitrate` skaliert mit der Auflösung (HD 10M, 4K 40M, 8K 100M).
- Fortschritt/ETA im Director's-Cut-Export-Dialog: verstrichene Zeit + qualitätsabhängige Erwartung, kein synthetischer Prozentsprung mehr; Texte in EN/DE/ES.
- Nicht angefasst: Abrechnung (DC-Renders sind kostenfrei), Wallet, Video-Generierung, Lip-Sync, Sensor-Baseline.

## Antwort an den Kunden (Kurzfassung)

Der Export ging über den regulären Weg und ist nie fehlgeschlagen. Lang war er, weil 4K gewählt war: identische 10 Sekunden brauchten in HD 1–2 Minuten, in 4K 5–10 Minuten. Wir beschleunigen 4K spürbar und zeigen die Wartezeit künftig ehrlich an.
