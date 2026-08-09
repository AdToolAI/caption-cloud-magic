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

1. **Nur echte Formate anbieten**: Die Auswahl zeigt pro Modell ausschließlich Verhältnisse, die das Modell wirklich akzeptiert. Kein 2:1 bei Modellen ohne 2:1, kein stilles Umbiegen.
2. Die Listen werden an die echten Modell-Fähigkeiten angeglichen — aktuell fehlen z. B. 3:2, 2:3, 21:9, 5:4, obwohl Seedream/Nano Banana sie können.
3. Beim Modellwechsel springt ein nicht mehr unterstütztes Verhältnis automatisch auf das nächstliegende erlaubte, sichtbar in der Auswahl.
4. Serverseitiges Mapping bleibt nur als Sicherheitsnetz (falls doch etwas Ungültiges ankommt), ist aber im Normalbetrieb nie nötig.

## Zur Frage 2: Welches Bildmodell nutzt ChatGPT — und weitere Modelle

ChatGPT erzeugt Bilder mit OpenAIs eigenem Modell **GPT-Image** (Nachfolger von DALL·E 3), aktuell **GPT-Image-2**. Das ist über die Lovable-AI-Anbindung direkt verfügbar — kein eigener OpenAI-Key nötig. Formate dort: 1:1, 3:2, 2:3 (feste Größen), also z. B. **kein** 16:9 und kein Banner.

Midjourney hat **keine offizielle API** — nur inoffizielle Discord-Bridges, die gegen die Nutzungsbedingungen verstoßen und regelmäßig abgeschaltet werden. Das baue ich nicht ein.

Vorschlag zur Erweiterung:

| Neu | Stärke | ca. Kosten/Bild |
| --- | --- | --- |
| GPT-Image-2 (ChatGPT-Modell) | Prompt-Treue, saubere Texte, ChatGPT-Look | ~$0.02–0.08 je Qualität |
| FLUX 1.1 Pro Ultra | Midjourney-nächster Look, 4 MP, sehr fotoreal | ~$0.06 |
| Ideogram v3 Turbo | Beste Text-/Logo-Darstellung im Bild | ~$0.03 |
| Recraft v3 | Vektor/Icon/Brand-Grafiken, echtes SVG | ~$0.04 |
| Qwen Image | Günstiger Allrounder | ~$0.02 |

Die vier Stufen (Standard/Fast/Pro/Ultra) bleiben als Schnellwahl, darunter kommt eine ausklappbare Liste "Spezialmodelle" mit Eignungs-Hinweis. Jedes Modell bringt seine eigene, geprüfte Formatliste mit.


## Technische Details

- `src/config/pictureStudioModels.ts`: Fähigkeits-Matrix um die neuen Modelle erweitern, pro Modell `aspectRatios` und `cost` ergänzen — eine einzige Quelle für UI-Filter und Preis.
- `src/components/picture-studio/ImageGenerator.tsx`: `TIER_ASPECTS` durch die Matrix ersetzen, ausgegraute Optionen mit Mapping-Hinweis, Modell-Auswahl erweitern.
- `supabase/functions/generate-image-replicate/index.ts`: `ASPECT_SUPPORT` und den Modell-Slug-Zweig um die neuen Modelle ergänzen; Mapping-Logik bleibt unverändert.
- Credits: Abbuchung weiterhin erst nach Erfolg, Kosten pro Modell aus der Matrix.

## Prüfung danach

- Banner-Format bei jedem Modell: entweder echtes 2:1 oder sichtbarer Mapping-Hinweis, kein Fehlschlag.
- Je ein Testbild pro neuem Modell inkl. korrekter Kostenbuchung.
