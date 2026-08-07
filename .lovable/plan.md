# Seedance 2.5: Referenzbilder optional machen + Multi-Reference korrekt verdrahten

## Kurzantwort auf deine zwei Fragen

1. **7 Referenzbilder?** Nein — das „1–7 Bilder" im Screenshot ist Text aus dem **Vidu Q2**-Baustein. Der wird für Seedance 2.5 mitbenutzt. In unserer Modell-Konfiguration steht für Seedance 2.5 bereits `maxReferences: 4`, angezeigt wird trotzdem der Vidu-Text („1–7", „Vidu kombiniert sie in einer 5s-Szene", „Reference2V"). Die exakte offizielle Obergrenze von ModelArk muss ich noch in der Doku gegenprüfen, bevor wir eine Zahl fest zusagen.
2. **Video ohne Referenzbild?** Ja, technisch geht das — Text-to-Video ist im Backend voll unterstützt (Bilder sind dort optional). Blockiert wird es nur durch die Oberfläche: weil Seedance 2.5 als Multi-Reference-Modell markiert ist, verlangt der Generator zwingend mindestens 1 Bild („Bitte mindestens 1 Referenzbild hinzufügen"). Das ist ein Bug, kein Modell-Limit.

Zusätzlich gefunden: Selbst wenn du Bilder hochlädst, kommen sie **nicht** beim Modell an. Die Oberfläche schickt sie unter einem anderen Feldnamen, als die Seedance-2.5-Funktion liest — die Bilder werden stillschweigend verworfen. Das würde bezahlte Generierungen ohne die gewünschte Referenz erzeugen.

## Was geändert wird

1. **Referenzbilder optional**: Für Seedance 2.5 entfällt der Zwang zu mindestens einem Bild. Ohne Bild = reines Text-to-Video, mit Bild(ern) = Referenz-Modus. Für Vidu bleibt die Pflicht bestehen (dort ist sie korrekt).
2. **Texte modellgerecht**: Der Multi-Reference-Block zeigt für Seedance 2.5 die richtige Anzahl („1–4 Bilder", bzw. den verifizierten Wert), einen Seedance-Hinweistext statt der Vidu-/Reference2V-Formulierung und statt der Warnung einen neutralen Hinweis „optional".
3. **Bilder kommen wirklich an**: Feldnamen zwischen Oberfläche und Seedance-2.5-Funktion angleichen, damit hochgeladene Referenzen tatsächlich an ModelArk gehen.
4. **Obergrenze verifizieren**: ModelArk-Doku zu Seedance 2.5 prüfen (max. Anzahl Referenzbilder, erlaubte Rollen, Kombination mit First-/Last-Frame) und die Konfiguration darauf setzen. Bis zur Bestätigung bleibt es bei 4.

## Technische Details

- `src/components/ai-video/ToolkitGenerator.tsx`: Pflicht-Check bei `capabilities.multiRef` auf ein neues, modellspezifisches Flag umstellen (z. B. `multiRefRequired`), das nur Vidu setzt. Body-Feld für Seedance 2.5 als `referenceImageUrls` senden (Vidu behält `referenceImages`/`referenceRoles`).
- `src/config/aiVideoModelRegistry.ts`: `multiRefRequired: true` bei Vidu Q2; Seedance 2.5 bleibt `multiRef: true`, `maxReferences` nach Doku-Prüfung.
- `src/components/ai-video/MultiReferenceUploader.tsx`: Überschrift/Beschreibung/Fußnote aus Props statt hartkodierter Vidu-Texte (DE/EN/ES), Warnung nur wenn Bilder Pflicht sind.
- Keine Änderung an Credits, Poller oder `_shared/modelark.ts` (dort ist die Referenz-Rolle `reference_image` bereits korrekt implementiert).

## Prüfung danach

- Seedance 2.5 ohne Bild: „Generieren" ist klickbar, Job startet als Text-to-Video.
- Seedance 2.5 mit 2 Bildern: Payload enthält die Referenz-URLs, Ergebnis übernimmt die Motive.
