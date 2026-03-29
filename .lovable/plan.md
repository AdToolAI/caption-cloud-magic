
Do I know what the issue is? Yes.

Es sind sehr wahrscheinlich 2 getrennte Fehler, die zusammen wie “alles ist weiß” wirken:

1. UI-Bug in der Grid-Ansicht  
- In `src/index.css` gibt es eine globale Regel:
  `img[loading="lazy"] { opacity: 0 }`
  und sichtbar wird das Bild nur mit der Klasse `.loaded`.
- `src/components/picture-studio/ImageCard.tsx` setzt zwar `loading="lazy"`, fügt aber nie `.loaded` hinzu.
- Ergebnis: Das Bild ist da, aber bleibt unsichtbar. Deshalb funktioniert die Lightbox, die kein `loading="lazy"` nutzt, während die Karten weiß bleiben.

2. Persistenz-Bug bei gespeicherten Dateien  
- Ich habe die zuletzt gespeicherten `studio_images.image_url` geprüft: die öffentlichen Bild-URLs selbst rendern ebenfalls weiß.
- Das heißt: Ein Teil der bereits gespeicherten Dateien im Bucket ist tatsächlich fehlerhaft oder als leere/weiße Bilddatei gespeichert.
- Deshalb reicht ein reiner CSS-Fix nicht aus, wenn ältere Bilder aus `studio_images` geladen werden.

Was ich ändern würde:

1. Globalen Lazy-Image-Bug sauber beheben
- Datei: `src/index.css`
- Die globale Regel für alle `img[loading="lazy"]` entfernen oder auf eine opt-in Klasse einschränken (z. B. `.lazy-fade`).
- So verhindern wir, dass Bilder app-weit unsichtbar bleiben, wenn kein `.loaded` gesetzt wird.

2. Picture-Studio-Karten robust machen
- Datei: `src/components/picture-studio/ImageCard.tsx`
- Entweder:
  - `loading="lazy"` dort entfernen, oder
  - `onLoad` + lokaler `isLoaded` State ergänzen und erst dann sichtbar machen.
- Zusätzlich Fehlerzustand ergänzen (`onError`), damit statt einer weißen Fläche ein klarer Fallback erscheint.

3. Upload-Pipeline der Studio-Bilder härten
- Datei: `supabase/functions/generate-studio-image/index.ts`
- Den Storage-Upload nicht mehr nur aus manuell dekodierten Bytes aufbauen, sondern die Data-URL per `fetch(imageData)` in ein `Blob` umwandeln und dieses hochladen.
- MIME-Type und Extension weiter explizit setzen.
- Optional nach dem Upload einen kurzen Integritätscheck einbauen:
  - Public URL erzeugen
  - Datei erneut abrufen
  - wenn Response leer/ungültig ist, Fehler statt kaputtes Bild speichern

4. Frische Generierungen und gespeicherte Bilder bewusst trennen
- Datei: `src/components/picture-studio/ImageGenerator.tsx`
- Frisch generierte Bilder weiterhin sofort mit `previewUrl` anzeigen.
- Gespeicherte `url` nur als persistente Quelle verwenden.
- So bleibt die Sofortansicht stabil, auch wenn ältere gespeicherte Assets defekt sind.

5. Bestehende weiße Altbilder berücksichtigen
- Bereits defekte Bilder in `studio_images` werden durch den UI-Fix nicht automatisch repariert.
- Nach dem Upload-Fix sind neue Bilder korrekt.
- Alte weiße Bilder müssen neu generiert oder gezielt ersetzt werden.

Betroffene Dateien
- `src/index.css`
- `src/components/picture-studio/ImageCard.tsx`
- `src/components/picture-studio/ImageGenerator.tsx`
- `supabase/functions/generate-studio-image/index.ts`

Erwartetes Ergebnis
- Neue Bilder sind sofort in der Grid-Ansicht sichtbar
- Die Lightbox bleibt funktionierend
- Nach Reload sind neue gespeicherte Bilder ebenfalls sichtbar
- Der systemische “weiße Karten”-Bug durch die globale Lazy-Load-CSS ist weg
- Alte bereits kaputte Bilder bleiben als Altbestand erkennbar und müssen separat neu erzeugt werden

Wichtigste Erkenntnis
- Der aktuelle sichtbare Fehler in der Außenansicht ist nicht nur “das Bild ist weiß”, sondern zuerst: “das Grid versteckt Lazy-Images global”.
- Zusätzlich gibt es sehr wahrscheinlich beschädigte ältere Storage-Dateien.
- Die richtige langfristige Lösung ist deshalb: UI-Sichtbarkeit + Storage-Persistenz beide korrigieren, nicht nur eines von beiden.
