# Picture Studio: Banner-Format klären + neue Bildmodelle

## Zur Frage 1: Ja, es war (auch) ein Format-Problem

Belegt im Code:

- Die Auswahl bot `2:1 Banner` an. Keines der kostenpflichtigen Modelle akzeptiert `2:1`:
  - Seedream 4 (Fast): u. a. 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 21:9
  - Imagen 4 Ultra (Pro): nur 1:1, 4:3, 3:4, 16:9, 9:16
  - Nano Banana 2 (Ultra): u. a. 1:1, 4:5, 5:4, 3:2, 2:3, 21:9 — aber kein 2:1
- Ein nicht erlaubter Wert lässt das Modell die komplette Anfrage ablehnen → genau der stille "Bildgenerierung fehlgeschlagen"-Fehler.
- Seit dem letzten Fix wird serverseitig auf das nächstliegende erlaubte Verhältnis gemappt (2:1 → 21:9), und die Auswahl blendet nicht unterstützte Formate pro Modell aus.

Nebenwirkung, die ich sauber machen möchte: Bei Pro/Ultra verschwindet "Banner" jetzt kommentarlos aus der Liste, statt zu erklären, was passiert.

### Was ich dazu ändere

1. Nicht unterstützte Formate bleiben sichtbar, aber ausgegraut mit Hinweis "Bei Nano Banana 2 wird daraus 21:9".
2. Die Filterlisten in der Oberfläche werden an die echten Modell-Listen angeglichen (aktuell fehlen z. B. 3:2, 2:3, 21:9, 5:4 bei Fast/Ultra, obwohl die Modelle sie können).
3. Nach der Generierung zeigt die Bildkarte das tatsächlich verwendete Verhältnis, wenn gemappt wurde.

## Zur Frage 2: Weitere Bildmodelle

Midjourney selbst hat **keine offizielle API** — nur inoffizielle Discord-Bridges, die gegen die Nutzungsbedingungen verstoßen und regelmäßig abgeschaltet werden. Das würde ich nicht einbauen.

Stattdessen diese Modelle, alle über die bereits verbundene Replicate-Anbindung, jeweils mit eigenem Preis und eigener Format-Liste:

| Neu | Stärke | ca. Kosten/Bild |
| --- | --- | --- |
| FLUX 1.1 Pro Ultra | Midjourney-nächster Look, 4 MP, sehr fotoreal | ~$0.06 |
| FLUX Kontext Pro | Gezieltes Bild-Editing per Anweisung | ~$0.04 |
| Ideogram v3 Turbo | Mit Abstand beste Text-/Logo-Darstellung im Bild | ~$0.03 |
| Recraft v3 | Vektor/Icon/Brand-Grafiken, echtes SVG möglich | ~$0.04 |
| Qwen Image | Sehr guter Allrounder, günstig | ~$0.02 |

Vorschlag: Die vier Stufen (Standard/Fast/Pro/Ultra) bleiben als Schnellwahl, darunter kommt eine ausklappbare Modell-Liste "Spezialmodelle" mit den obigen Einträgen inkl. Eignungs-Hinweis ("bester Text im Bild", "Vektor/Logo", "Editing").

## Technische Details

- `src/config/pictureStudioModels.ts`: Fähigkeits-Matrix um die neuen Modelle erweitern, pro Modell `aspectRatios` und `cost` ergänzen — eine einzige Quelle für UI-Filter und Preis.
- `src/components/picture-studio/ImageGenerator.tsx`: `TIER_ASPECTS` durch die Matrix ersetzen, ausgegraute Optionen mit Mapping-Hinweis, Modell-Auswahl erweitern.
- `supabase/functions/generate-image-replicate/index.ts`: `ASPECT_SUPPORT` und den Modell-Slug-Zweig um die neuen Modelle ergänzen; Mapping-Logik bleibt unverändert.
- Credits: Abbuchung weiterhin erst nach Erfolg, Kosten pro Modell aus der Matrix.

## Prüfung danach

- Banner-Format bei jedem Modell: entweder echtes 2:1 oder sichtbarer Mapping-Hinweis, kein Fehlschlag.
- Je ein Testbild pro neuem Modell inkl. korrekter Kostenbuchung.
