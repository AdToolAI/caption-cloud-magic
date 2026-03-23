
Plan: Dashboard-Karussell auf „neueste zuerst“ umstellen, echte Publish-Logik ergänzen, Rotation robust machen, Mute-Button hinzufügen

Warum es aktuell noch falsch ist
- Der aktuelle Sortiercode bevorzugt weiterhin Videos mit `download_count/share_count > 0`. Genau dadurch bleiben die drei November-Videos vorne.
- Diese Metrik ist kein verlässlicher Beweis für „wirklich gepostet“ und passt nicht zu deinem gewünschten Verhalten.
- Die Scroll-Rotation hängt zu tief im Carousel und verpasst Events über Header, Pfeilen und Seitenkarten.
- Der aktive Clip ist hart auf `muted`, aber ohne sichtbaren Sound-Schalter.
- Fehler-/Retry-Zustände werden per Array-Index gespeichert; bei neuer Sortierung können dadurch falsche Karten betroffen sein.

Umsetzung
1. Ranking korrigieren
- Hero-Karussell standardmäßig strikt nach `created_at DESC` aufbauen.
- `download_count/share_count` komplett aus dem Hero-Ranking entfernen.
- Nur die 10 neuesten erfolgreichen Videos zeigen.
- Das aktuelle „Best“-Badge nur noch anzeigen, wenn es echte veröffentlichte Performance-Daten gibt.

2. „Wenn gepostet, dann bevorzugen“ sauber lösen
- Nicht mehr Downloads/Shares als Proxy verwenden.
- Stattdessen Videos nur dann boosten, wenn sie mit echten Publish-/Analytics-Daten verknüpft werden können.
- Matching über normalisierte Video-URL zu bestehenden Publish-Daten aufbauen.
- Falls kein Match existiert: rein „neueste zuerst“.

3. Rotation endlich zuverlässig machen
- Wheel-Steuerung auf den gesamten Carousel-Bereich per `onWheelCapture` legen.
- `deltaX` und `deltaY` normalisieren, damit Maus, Trackpad und Magic Mouse funktionieren.
- Drag/Swipe in Embla wieder aktivieren, damit Rotation auch ohne Wheel möglich ist.
- Throttle beibehalten, damit pro Scroll-Geste nur ein sauberer Schritt passiert.

4. Sichtbaren Mute-Button ergänzen
- Auf der aktiven mittleren Karte einen Mute/Unmute-Button neben dem Expand-Button anzeigen.
- Autoplay aus Browsergründen weiterhin stumm starten.
- Nach User-Interaktion Ton aktivierbar machen und den Zustand beim Weiterdrehen beibehalten.
- Optional denselben Zustand in den großen Preview-Dialog mitgeben.

5. State robuster machen
- `errorVideos`, `retriedVideos` und ähnliche UI-Zustände auf `video.id` statt auf Index umstellen.
- `selectedIndex` zurücksetzen bzw. sauber normalisieren, wenn sich die sichtbare Liste ändert.
- Legacy-/defekte URLs nach erstem echten Fehlversuch aus dem Hero entfernen oder als Fallback überspringen.

Betroffene Dateien
- `src/components/dashboard/DashboardVideoCarousel.tsx` — Sortierung, Publish-Boost, Rotation, Mute-Button, ID-basierter Zustand
- optional `src/components/video/VideoPreviewPlayer.tsx` — Mute-Zustand im großen Player übernehmen

Erwartetes Ergebnis
- Zuerst werden immer die neuesten Videos angezeigt.
- Sobald es wirklich veröffentlichte Videos mit Analytics-Bezug gibt, können genau diese priorisiert werden.
- Das Karussell dreht per Scroll und Drag zuverlässig.
- Im aktiven Fenster ist ein sichtbarer Sound-Button vorhanden.
