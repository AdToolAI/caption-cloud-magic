# Zurück auf den Stand vom 27.07.2026 (v169)

## Wo wir am 27.07. standen — und was seitdem passiert ist

Ich habe den Code gegen den 27.07.-Stand geprüft. Ergebnis: **die v169-Architektur liegt vollständig und aktiv im Code.** Verifiziert:

- Paralleler Fan-out, `concurrencyCap = 4`, Killswitch aktiv.
- Per-Pass-Lock aktiv.
- Per-Slot-Schreibzugriff statt Voll-Rewrite.
- Preclip-Pre-Fanout für Passes jenseits des Caps.
- Jeder Pass nutzt seinen **eigenen** Preclip als Input — keine Verkettung auf den Vorgänger-Output.
- Webhook plus Watchdog mit Reconcile und idempotentem Refund.

Es muss also nichts neu gebaut werden. Kaputt gemacht haben es die Schichten, die **nach** dem 27.07. daraufgesetzt wurden. Diese vier Punkte habe ich konkret nachgewiesen:

1. **v327 kippt bei „bewegten" Sprechern den Preclip komplett weg** und schickt die volle Plate mit per-Frame-Boxen an Sync.so. Das ist exakt der Full-Frame-Pfad, den v169 abgeschafft hatte — weil der Provider dabei auf Nachbargesichter übergreift. Das ist das Morphen in deinem Aufzug-Screenshot.
2. Der Mux **widerspricht** dem: für Mehrsprecher bricht er hart ab, wenn ein Pass keinen Crop hat. Ein v327-Tracked-Pass hat per Definition keinen. Beide Regeln können nicht gleichzeitig gelten.
3. Dein letzter Zwei-Sprecher-Lauf lief mit **Face-Share 18,1 % und 15,5 %**. Das Face-Gate meldete für beide `probe_unavailable` — und hat trotzdem dispatcht.
4. Die Overlay-Maske hat einen **festen Radius von 28 %** der kürzeren Bildachse. Sie deckt weit mehr als das Gesicht ab und mischt Provider-Output über Haut und Hintergrund.

## Umsetzung: die Post-27.07.-Schichten entfernen

### 1. Preclip als einzige Wahrheit zurückholen
- Zwei oder mehr Sprecher: ausnahmslos ein eigener Single-Face-Preclip pro Pass. Keine Full-Plate-Dispatches.
- v327-Tracked-Pfad für Mehrsprecher deaktivieren.
- Bewegung wird **innerhalb** des Preclips aufgefangen: der Crop wird so dimensioniert, dass die gemessene Bewegungsbahn des Sprechers über sein Sprechfenster mit Sicherheitsrand hineinpasst.
- Passt ein Sprecher nicht sauber hinein: ehrlich fehlschlagen und erstatten statt morphen.

### 2. Overlay-Maske eng ans Gesicht binden
- Radius proportional zur tatsächlichen Gesichtsbox statt pauschal 28 % der Bildachse.
- Harte Obergrenze relativ zum Abstand zum nächsten Nachbargesicht — zwei Overlays können sich nie überlappen.
- Nur Mund- und Kieferbereich wird ersetzt; Stirn, Haaransatz, Hintergrund bleiben Plate.
- Stille Freeze-Layer bleiben aus, wie im v169-Stand.

### 3. Face-Gate scharf statt durchwinken
- `probe_unavailable` ist bei Mehrsprecher-Szenen kein Freifahrtschein mehr.
- Vor dem Dispatch verlangt: ausreichende Gesichtsgröße im tatsächlich gesendeten Clip, eindeutige Identität pro Slot, kein Slot doppelt belegt.
- Grenzwert für den Gesichtsanteil deutlich über die zuletzt gemessenen 15–18 % anheben.
- Darunter: nicht dispatchen, erstatten, klare Meldung.

### 4. Widerspruch Dispatch ↔ Mux auflösen
- Eine gemeinsame Regel: der Mux erwartet für Mehrsprecher immer einen gültigen Crop, und der Dispatch garantiert ihn.
- Damit entfällt der Zustand „Provider fertig, Mux bricht ab oder weicht still auf einen weichen Fallback aus".

### 5. Kontrolliert verifizieren
- Erst die Aufzug-Szene aus deinem Screenshot: zwei Sprecher, beide klar sichtbar.
- Belege pro Pass: eigener Preclip, Gesichtsanteil über Grenzwert, korrekte Identität, kein Full-Plate-Dispatch, saubere Maskengrenzen.
- Danach vier Sprecher, danach ein sich bewegender Sprecher.

## Technische Details
- `supabase/functions/compose-dialog-segments/index.ts` — v327-Tracked-Pfad für N≥2 aus, Preclip-Pflicht zurück, Bewegungsbahn in die Crop-Berechnung, Face-Share-Grenzwert anheben.
- `supabase/functions/_shared/pass-face-preclip.ts` — Crop deckt die Bewegungsbahn über das Sprechfenster ab.
- `supabase/functions/_shared/face-motion-track.ts` — Track dimensioniert nur noch den Crop, ist kein Full-Plate-Schalter mehr.
- `supabase/functions/_shared/syncso-face-gate.ts` — `probe_unavailable` bei N≥2 fail-closed.
- `supabase/functions/render-sync-segments-audio-mux/index.ts` — Maskenradius gesichtsproportional mit Nachbarabstands-Deckel; Crop-Pflicht bleibt.

## Abwägung
Der Preis: stark bewegte Sprecher, die sich nicht in einen stabilen Crop fassen lassen, schlagen künftig ehrlich fehl statt einen morphenden Clip zu liefern. Das halte ich für richtig — ein sauberer Fehlschlag mit Erstattung ist besser als ein Video, das du nicht ausliefern kannst. Wenn du für bewegte Sprecher lieber einen weichen Fallback willst, baue ich stattdessen ein automatisches Neu-Rendern der Plate mit fixierter Kamera ein.