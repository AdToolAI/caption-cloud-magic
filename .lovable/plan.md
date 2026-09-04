# Topaz & Clarity scharfschalten

Stand heute: Die Oberfläche ist fertig (Upscale · Restaurieren · Kolorieren, echte Modellnamen, alle Regler, Preisvorschau, Vorher/Nachher, Vergleich). Was noch fehlt, ist die Freischaltung:

- Die neue Verbesserungs-Funktion im Backend ist geschrieben, aber noch nicht ausgerollt.
- Clarity Pro läuft im Studio weiterhin über den alten Weg (0,03 € / 0,06 €) — funktioniert, nutzt aber die neuen Regler noch nicht.
- Alle drei Topaz-Modelle sind absichtlich gesperrt ("bald verfügbar"), vorne und im Backend, bis ein echter Testlauf und deine Preisfreigabe vorliegen.

Also: sichtbar und vollständig vorbereitet, aber noch nicht einsatzbereit.

## Was ich als Nächstes mache

1. Backend-Funktion ausrollen und Clarity Pro darüber laufen lassen — Preise bleiben exakt 0,03 € / 0,06 €.
2. Ein echter Clarity-Durchlauf zur Kontrolle: Abbuchung, Ergebnis in der Mediathek, Download, Rückerstattung im Fehlerfall.
3. Topaz Image Upscale intern freischalten (nur für dein Konto) und je einen günstigsten echten Testlauf starten: 2×, Gesichts-Verbesserung an/aus.
4. Dasselbe für Dust & Scratch (Restaurieren) und Colorization (Kolorieren) mit je einem Testbild.
5. Ich lege dir danach eine kurze Tabelle vor: tatsächliche Anbieterkosten, Dauer, Qualitätseindruck je Modell — mit meinem Preisvorschlag.
6. Nach deiner Freigabe: Topaz für alle Kunden freischalten, danach "Topaz vs. Clarity vergleichen" aktivieren.

## Technische Details

- `enhance-image` deployen; `upscale-image` bleibt bis Schritt 2 bestätigt ist unangetastet und wird erst danach abgelöst.
- `ImageCard`/`StudioLightbox` von `useImageUpscaler` auf `useEnhanceImage` umstellen (gleiche Preise, gleiche Abbuchung).
- Freischaltung zweistufig: Registry-Flags (`picture.enhance.topaz_*`) im Frontend und `PICTURE_TOPAZ_*_ENABLED` als Backend-Schalter — beide bleiben aus, bis die Preise freigegeben sind.
- Testläufe kosten echtes Guthaben (kleinstmögliche Bilder, 2×), keine Kundenkonten betroffen.
- Unit-Tests für Adapter-Payloads und Preisberechnung ergänzen.
