
Ziel: Das KI Picture Studio soll im Modus „Brand Logo“ wirklich nur freigestellte, bildfüllende Logos erzeugen, die sofort sichtbar sind, anklickbar sind und sich sauber im Lightbox-Preview öffnen lassen.

Was ich im Code gefunden habe:
1. Die Bilder sind aktuell im Grid auf `aspect-square` + `object-cover` fest verdrahtet (`ImageCard.tsx`). Das behandelt Logos wie Fotos, schneidet Formate falsch zu und zeigt nicht das eigentliche Asset.
2. In `ImageGenerator.tsx` und `AlbumManager.tsx` wird `onOpenLightbox` gar nicht an `ImageCard` übergeben. Deshalb passiert beim Klick aktuell praktisch nichts.
3. Für `brand-logo` gibt es im Backend nur einen normalen Style-Zusatz. Es fehlt ein harter „Logo-only“-Modus mit Ausschlüssen wie Mockup, Produktfoto, 3D-Objekt, Tisch, Kamera, Verpackung etc.
4. Die Upload-Pipeline speichert alles pauschal als `.png` mit `image/png`, obwohl das Modell theoretisch andere Bildtypen zurückgeben kann. Das kann Browser-Rendering unzuverlässig machen, obwohl der Download lokal funktioniert.
5. Die Galerie zeigt aktuell nur die Storage-URL. Wenn diese verzögert oder vom Browser nicht sauber gerendert wird, sieht man nicht sofort das echte generierte Bild.

Umsetzungsplan:
1. Bildanzeige im Studio korrekt machen
- `src/components/picture-studio/ImageCard.tsx`
- Von festem `aspect-square` auf echtes Seitenverhältnis aus `image.aspectRatio` umstellen
- Statt `object-cover` auf `object-contain` wechseln
- Weiße „Stage“ mit Innenabstand nutzen, damit Logos komplett sichtbar sind
- Klickfläche sauber beibehalten

2. Echte Lightbox für das Picture Studio einbauen
- Neue Lightbox/Dialog-Komponente für Studio-Bilder anlegen
- `ImageGenerator.tsx` und `AlbumManager.tsx` mit `selectedImage`-State erweitern
- `onOpenLightbox` an `ImageCard` durchreichen
- In der Lightbox: großes Bild auf weißem Hintergrund, Download, In Album, Löschen

3. Logo-Generierung im Backend hart auf „nur Logo“ umstellen
- `supabase/functions/generate-studio-image/index.ts`
- Für `brand-logo` einen separaten Prompt-Pfad statt nur eines losen Style-Modifiers verwenden
- Harte Regeln ergänzen:
  - nur isoliertes Logo / Logomark / Wortmarke
  - kein Mockup
  - kein Produkt
  - keine Kamera
  - kein Tisch / keine Szene
  - kein 3D-Foto-Setup
  - Logo soll 70–90% der Fläche einnehmen
  - je nach Ratio als zentriertes, horizontales oder vertikales Lockup ausgeben
- Widerspruch „transparent background“ vs. „clean white canvas“ entfernen

4. Sofort sichtbares Preview der echten Generierung liefern
- Edge Function soll zusätzlich zur gespeicherten URL auch eine direkte Preview-URL aus der Modellantwort zurückgeben
- Die UI zeigt zuerst dieses echte Generierungsbild an und fällt erst danach auf die gespeicherte URL zurück
- So sieht der Nutzer direkt das erstellte Bild statt eines leeren/weißen Platzhalters

5. Dateityp robust speichern
- MIME-Type aus dem Data-URL-Header erkennen
- Passende Extension + `contentType` beim Upload setzen
- So werden die gespeicherten Assets im Browser zuverlässiger direkt angezeigt

Technische Details:
- Betroffene Dateien:
  - `src/components/picture-studio/ImageCard.tsx`
  - `src/components/picture-studio/ImageGenerator.tsx`
  - `src/components/picture-studio/AlbumManager.tsx`
  - neue Studio-Lightbox-Komponente unter `src/components/picture-studio/`
  - `supabase/functions/generate-studio-image/index.ts`
- Keine Datenbankänderung nötig
- Wichtig: Im Brand-Logo-Modus wird die Logik nicht mehr „ein schönes Bild mit Logo“ erzeugen, sondern gezielt „ein Logo als Hauptmotiv“

Erwartetes Ergebnis:
- Brand-Logo erzeugt nur noch echte Logo-Assets statt Foto-/Mockup-artiger Bilder
- Das Logo füllt die Fläche sinnvoll aus
- Generierte Bilder sind sofort sichtbar
- Karten sind wieder klickbar
- Lightbox funktioniert
- Download, Anzeige und gespeicherte Version verhalten sich konsistent
