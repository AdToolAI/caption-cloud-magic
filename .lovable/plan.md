## Plan: Hailuo 6s hart respektieren

1. **Frontend-Ursache fixen**
   - In `SceneCard.tsx` beim Modellwechsel auf Hailuo die bestehende Szenendauer sofort provider-konform setzen, aber **6s bevorzugen**, wenn die aktuelle Dauer nicht exakt 10s ist.
   - Beispiel: HappyHorse 7/8/9/15s → Hailuo wird nicht mehr „ceil“ Richtung 10s, sondern auf 6s gesetzt, außer der Nutzer wählt bewusst 10s.

2. **Dialog-Generierung absichern**
   - In `SceneDialogStudio.tsx` bleibt die Regel: User-Pick gewinnt immer.
   - Zusätzlich wird Hailuo-Dauer nur aus dem expliziten Szenenwert abgeleitet: exakt `10` bleibt 10, alles andere bleibt/ wird 6.
   - Audio-Länge darf die Szene weiterhin **nicht** hochstufen; bei zu langem Audio nur Hinweis + `cut_off`.

3. **Backend-Hardening**
   - In `compose-video-clips` die Hailuo-Render-Dauer nicht mehr über `>= 8 ? 10 : 6` ableiten, sondern strikt: `scene.durationSeconds === 10 ? 10 : 6`.
   - Dadurch kann auch serverseitig kein 8/9s-Zwischenwert versehentlich wieder 10s auslösen.

4. **Warntext korrigieren**
   - Die UI-Warnung „wird auf 6s oder 10s anpassen“ präzisieren: bei Hailuo wird nur 10s genutzt, wenn 10s explizit gewählt ist; sonst 6s.

5. **Validierung**
   - Gezielt prüfen, dass der Ablauf `Hailuo Pro auswählen → 6s klicken → Dialog starten` den Zustand bei `durationSeconds: 6` hält und keine automatische 10s-Umschaltung mehr passiert.