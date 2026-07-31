## Befund (aus den Logs von Szene 69d56a49…, 31.07. 22:48–22:50)

Die Pipeline läuft technisch sauber durch — Sync.so bekommt für alle 4 Sprecher einen Job, alle 4 liefern ein Ergebnis. Das Problem liegt **vor** dem Provider, in der Zuschnitt-Geometrie:

| Pass | Sprecher | Gesichts-Box im Plate | Preclip-Crop | Gesichtsanteil |
|---|---|---|---|---|
| 2 | Matthew | 67 × 88 px | 394 × 394 | ~3,8 % |
| 3 | Sarah | 102 × 125 px | 394 × 394 | ~8,2 % |
| 4 | Kailee | 59 × 76 px | 394 × 394 | ~2,9 % |

Alle Logzeilen zeigen `v247_anchor=face_center face_share=0 mouth_off_px=0` und `mouth_used=false`.

Bedeutung: Der Mund-zentrierte Zuschnitt (der einen Gesichtsanteil von ~42 % garantiert) wurde **nicht** verwendet, weil er zwingend einen echten Mund-Landmark verlangt. Der Detektor lieferte für diese Plate nur Gesichts-Boxen, keine Mund-Landmarks (`v280_bbox_derived_mouth_anchor … no detector mouth landmark`). Dadurch fiel der Preclip auf den alten Grob-Crop zurück: 394 px Kasten um ein 60–100 px großes Gesicht. Nach dem Hochskalieren auf 720×720 ist der Mund nur noch wenige Pixel groß — Sync.so animiert dort praktisch nichts sichtbares. Genau das sieht man im Video.

Zusatzbefund: Die Frame-Probe ist serverseitig deaktiviert (`no_cache_no_server_extract`), das Face-Gate lässt den Dispatch deshalb ungeprüft durch (`dispatch will proceed unchecked`). Der offensichtlich untaugliche 3-%-Crop wird also nirgends gestoppt.

## Fix (klein, gezielt, kein neues Geometrie-Framework)

**1. Mund-Landmark ist nicht mehr Pflicht für den engen Crop**
In `supabase/functions/_shared/pass-face-preclip.ts`: Wenn eine valide Gesichts-Box vorliegt, aber kein Mund-Landmark, wird der Mund-Anker aus dem unteren Drittel der Box abgeleitet (exakt die Formel, die `compose-dialog-segments` bereits unter `v280_bbox_derived_mouth_anchor` benutzt) und `computeMouthCenteredCrop` damit gefüttert. Anker wird als `face_center_derived` protokolliert, damit die Herkunft sichtbar bleibt.
Ergebnis: Crop ≈ 1,54 × Gesichtsseite statt fix 394 px → Gesichtsanteil ~42 % statt 3 %.

**2. Harte Untergrenze für den Gesichtsanteil vor dem Dispatch**
Liegt `face_share_in_preclip` unter 15 %, wird der Crop einmalig auf die Box nachgezogen (statt zu dispatchen). Bleibt er darunter, wird der Pass mit klarer Meldung abgebrochen und die Credits erstattet — statt einen garantiert wirkungslosen Job zu bezahlen. Kein neuer „Trust-Contract", nur diese eine Schwelle.

**3. Telemetrie sichtbar machen**
`face_share`, `anchor` und `crop_size/face_size`-Verhältnis wandern in `syncso_dispatch_log.meta`, damit ein Fehlschlag künftig in einer SQL-Zeile erkennbar ist, statt in 76 Logzeilen.

## Verifikation

Nach dem Deploy eine 4-Sprecher-Szene rendern und prüfen:
- `v163_preclip_render OK … face_share=` liegt bei ≥ 0,35 für alle Passes
- `crop.size` liegt bei ~1,5 × der Gesichts-Box-Seite (also 90–200 px, nicht 394)
- Sichtprüfung des fertigen Clips

## Nicht Teil dieses Plans

Kein Zurückrollen weiterer Teile, keine Wiedereinführung der v334–v341-Geometrie-Tracker, keine Änderung an Provider, Webhook, Watchdog oder Mux.
