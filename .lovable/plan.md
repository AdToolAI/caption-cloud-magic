
Ich habe den Fehler jetzt genauer eingegrenzt:

Problem
- Das ist sehr wahrscheinlich kein reines UI-/CSS-Problem mehr.
- Die Grid-Karten sind weiß, weil die gespeicherte Bilddatei selbst im Browser als weiße Fläche ausgeliefert wird.
- Ich habe die gespeicherten öffentlichen Bild-URLs geprüft: Auch direkt aufgerufen rendern sie als komplett weiße PNGs.
- Gleichzeitig funktioniert die Lightbox inzwischen, weil dort offenbar der direkte `previewUrl`-Pfad bzw. ein bereits funktionierender Bildpfad genutzt wird.

Do I know what the issue is?
- Ja, diesmal ziemlich klar:
- Der Fehler sitzt sehr wahrscheinlich in `supabase/functions/generate-studio-image/index.ts`, also beim Persistieren der KI-Ausgabe in Storage.
- Nicht primär in `ImageCard.tsx`.

Wahrscheinliche Ursache
- Die Edge Function nimmt das `data:image/...;base64,...` Ergebnis der KI und wandelt es manuell mit `atob(...)` + `Uint8Array.from(...)` in Bytes um.
- Genau an dieser Stelle wird die Datei sehr wahrscheinlich nicht robust genug dekodiert oder in einem Format gespeichert, das zwar als PNG erkannt wird, aber im Browser als weiße Fläche endet.
- Das passt auch zu dem Verhalten:
  - Download/anderes Öffnen wirkt teilweise “ok”
  - Browser-Rendering der gespeicherten Datei ist weiß
  - direkte Base64-Vorschau kann trotzdem funktionieren

Betroffene Dateien
- `supabase/functions/generate-studio-image/index.ts`
- `src/components/picture-studio/ImageGenerator.tsx`
- optional `src/components/picture-studio/AlbumManager.tsx`

Plan
1. Persistenz in der Edge Function robust umbauen
- In `generate-studio-image/index.ts` die KI-Ausgabe nicht mehr nur “roh” per `atob + Uint8Array.from` hochladen
- Stattdessen den Data-URL-Header strikt parsen
- Base64-Inhalt robust dekodieren
- Falls nötig das Bild vor dem Upload in ein sauberes, browserstabiles Zielformat normalisieren
- Dateiendung und `contentType` exakt passend setzen

2. Sofort-Preview und gespeicherte URL sauber trennen
- `previewUrl` weiterhin für die unmittelbare Anzeige nach der Generierung verwenden
- Die persistierte `url` nur dann als Hauptquelle nutzen, wenn die gespeicherte Datei sicher browserlesbar ist
- So bleibt die UX stabil, auch falls Storage-Reparatur für ältere Bilder nötig ist

3. Fallback für bestehende defekte Bilder einbauen
- In `ImageGenerator.tsx` die lokal frisch generierten Bilder weiter aus `previewUrl` anzeigen
- Für ältere Bilder aus `studio_images` optional einen Reparaturpfad vorsehen, statt nur den weißen Storage-Link zu verwenden
- Dadurch sind neue Bilder sofort sichtbar, auch bevor Altbestände bereinigt werden

4. Brand-Logo-Ausgabe zusätzlich formatstabil machen
- Den Brand-Logo-Pfad so anpassen, dass nicht nur “weißes Canvas” oder Transparenz-Anweisungen kollidieren
- Statt widersprüchlicher Render-Hinweise ein konsistentes Ausgabeziel definieren:
  - isoliertes Logo
  - browserstabil gespeicherte PNG/WebP-Datei
  - klare Vordergrund-/Hintergrundlogik

5. Alte weiße Bilder berücksichtigen
- Bereits gespeicherte weiße Dateien werden durch Code allein nicht automatisch korrekt
- Ich würde die Umsetzung daher so planen, dass:
  - neue Generierungen sofort korrekt gespeichert werden
  - bestehende kaputte Bilder entweder neu generiert oder später gezielt repariert werden

Technische Einschätzung
- Der Screenshot und der direkte URL-Test zeigen: Das Problem liegt vor dem Frontend-Rendering.
- `ImageCard.tsx` war nur ein Nebenproblem, nicht die Hauptursache.
- Die langfristig richtige Lösung ist:
  - KI-Response sauber dekodieren
  - stabil in Storage speichern
  - erst dann die Public URL in `studio_images` ablegen

Erwartetes Ergebnis
- Neue generierte Bilder erscheinen sofort korrekt im Grid
- Die gespeicherte URL zeigt im Browser das echte Bild statt einer weißen PNG-Fläche
- Lightbox, Download und Grid verhalten sich konsistent
- Brand-Logo bleibt klickbar und sichtbar, ohne weiße Außenansicht

Technische Details
- Hauptverdacht: `generate-studio-image/index.ts` bei Base64→Bytes→Storage
- Sekundär: `ImageGenerator.tsx` sollte weiterhin `previewUrl` als sichere Sofortanzeige behalten
- Bestehende alte, bereits fehlerhaft gespeicherte Dateien müssen separat behandelt werden

Wenn ich das im nächsten Schritt umsetze, würde ich mich zuerst auf die Edge Function konzentrieren, nicht mehr auf das Grid-CSS.
