Ich habe die Ursache gefunden: Die Szenengenerierung scheitert nicht an der Ansicht, sondern an der Engine-Ansteuerung im Backend.

Konkrete Fehler:
- Kling-Szenen schlagen mit einem Validierungsfehler fehl: Das aktuell im Composer genutzte Kling-Modell erwartet ein `start_image` und nur 5s/10s Dauer. Der Auto-Director erzeugt aber normale Text-to-Video-Szenen mit 7s/8s.
- Sora wird vom Auto-Director als Engine ausgewählt, ist in der Composer-Generierung aber nicht implementiert. Dadurch bleiben diese Szenen einfach auf „Ausstehend“ hängen.
- Die UI zeigt aktuell nur allgemein „fehlgeschlagen“, aber nicht klar, dass es ein Engine-Konfigurationsproblem war.

Plan zur Behebung:

1. Kling im Composer auf das funktionierende Kling-3-Modell umstellen
   - In der Backend-Funktion `compose-video-clips` wird `ai-kling` auf dasselbe Kling-3-Modell umgestellt, das im AI Video Toolkit bereits genutzt wird.
   - Dadurch funktioniert Text-to-Video ohne `start_image`.
   - Die Dauer 3-15 Sekunden wird korrekt an Kling 3 weitergegeben, statt auf ungültige 7s/8s für das alte Modell zu laufen.

2. Auto-Director darf keine nicht unterstützten Composer-Engines mehr planen
   - `ai-sora` wird aus den Auto-Director-Engine-Optionen für Composer-Projekte entfernt oder auf eine unterstützte Engine gemappt.
   - Für „Premium“ wird stattdessen Kling/Luma/Veo oder Hailuo verwendet, je nachdem was in `compose-video-clips` tatsächlich verarbeitet wird.
   - Zusätzlich kommt eine defensive Normalisierung: Falls doch `ai-sora` in einem Auto-Director-Plan auftaucht, wird es vor dem Speichern/Generieren auf eine unterstützte Engine umgeschrieben, damit keine Szene hängen bleibt.

3. Bestehende hängen gebliebene Szenen reparierbar machen
   - Für Szenen mit `clip_source = ai-sora` oder ungültigem Kling-Setup wird die Re-Roll/Generieren-Logik so angepasst, dass sie mit einer unterstützten Engine neu gestartet werden können.
   - Optional kann ich die aktuell betroffenen Szenen deines Projekts auf eine unterstützte Engine zurücksetzen, sodass du nicht neu anfangen musst.

4. Bessere Fehleranzeige im Clips-Tab
   - Fehlgeschlagene Ergebnisse aus `compose-video-clips` sollen die echte Fehlermeldung in der Konsole/Toast nicht komplett verschlucken.
   - Die Szene soll künftig klar anzeigen: „Engine-Konfiguration ungültig“ oder „Modell nicht unterstützt“, statt nur generisch „Fehlgeschlagen“.

5. Absicherung der Credit-Logik
   - Es werden nur Szenen berechnet, die wirklich erfolgreich gestartet oder fertiggestellt wurden.
   - Für sofort fehlgeschlagene Szenen durch Engine-Validierung werden keine zusätzlichen Kosten abgezogen.

Technische Dateien:
- `supabase/functions/compose-video-clips/index.ts`
- `supabase/functions/auto-director-compose/index.ts`
- ggf. `src/components/video-composer/ClipsTab.tsx`
- ggf. aktueller Projektzustand in der Datenbank für die bereits hängenden Szenen

Nach Umsetzung sollte der Auto-Director nicht mehr bei Kling/Sora hängen bleiben: Neue Projekte generieren nur unterstützte Szenen, und bestehende fehlgeschlagene Szenen können direkt neu erzeugt werden.