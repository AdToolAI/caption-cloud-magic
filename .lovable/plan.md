# V449 — Dialogskript auf die 15-s-Plate kürzen

Die Szene `be60d106-…` (Projekt V449 — Rooftop Movement Lipsync Test) hat 6 Turns mit
~24 s prognostizierter Sprechzeit bei nur 15 s Plate. Das Skript wird gekürzt, sonst
nichts.

## Neues Skript (gleiche Reihenfolge, gleiche Sprecher, gleiche Turn-IDs)

```text
1 Sarah Dusatko:   Kurz abstimmen — wir haben wenig Zeit.
2 Samuel Dusatko:  Ich prüfe rechts die Sichtlinie.
3 Matthew Dusatko: Die Daten sind auf dem Tablet.
4 Kay Mark:        Ich mache den letzten Check.
5 Sarah Dusatko:   Gut, bleiben wir im Takt.
6 Samuel Dusatko:  Alles klar, wir starten.
```

Ziel: ~1,2–1,6 s pro Turn, zusammen rund 8–10 s — deutlich unter der 15-s-Plate,
mit Puffer für Pausen zwischen den Sprechern.

## Umsetzung

- Update auf `composer_scenes.be60d106-…`: `dialog_script` und die `text`-Felder der
  sechs Einträge in `dialog_turns` auf die neuen Zeilen setzen.
- `turnId`, `characterId` und `order` bleiben unverändert (kanonische Zuordnung v201,
  Voice-Bindung und Lip-Sync-Zuordnung bleiben stabil).
- Keine Änderung an Dauer (15 s), Provider (HappyHorse), Cast, Voices, Prompt oder Code.
- Kein Render, kein Deploy.

## Danach

Die UI-Prognose sollte „6 Blöcke · 4 Sprecher · ~9s" zeigen. Liegt sie noch über 12 s,
kürze ich die längsten Zeilen ein weiteres Mal.
