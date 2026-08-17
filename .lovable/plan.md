# FA-4 SETUP — Dialog-Kürzung auf ~9 s (kein Render)

Ziel: Die sechs Sprecherzeilen der FA-4-Szene so kürzen, dass die UI-Prognose von
~12 s auf ~8–10 s effektive Sprechzeit sinkt. Struktur bleibt unverändert:
6 Turns, 4 Sprecher, Sarah und Samuel je zweimal, Plate bleibt bei 15 s.

## Was geändert wird

Nur das Dialogskript der Szene `42bcdda1-3a42-4d2a-b43e-21f1888cd1f2`
(Projekt `035273d7-…`, S08). Keine Änderung an Provider, Cast, Voices,
Lip-Sync-Intent, Dauer oder Code.

### Neues Skript (6 Turns, Ziel ~1,2–1,6 s pro Turn)

```text
1 Sarah Dusatko:   Kurz die Zahlen von gestern.
2 Samuel Dusatko:  Kampagne läuft über Plan.
3 Matthew Dusatko: Neue Creatives performen besser.
4 Kay Mark:        Dann Budget nachziehen.
5 Sarah Dusatko:   Gut, Kurs halten.
6 Samuel Dusatko:  Übersicht kommt gleich.
```

Jede Zeile bleibt ein natürlicher, vollständiger deutscher Satz — kurz genug für
~1,2–1,6 s TTS, lang genug für sichtbare Mundbewegung und Voice-Zuordnung.

## Ablauf

1. Skript der Szene über die UI (Skript-Studio, Szene S08) ersetzen — gleiche
   Sprecherreihenfolge, gleiche Namensschreibweise, damit die kanonische
   Turn-Zuordnung und die Voice-Bindung unverändert bleiben.
2. UI-Prognose ablesen: Erwartung „6 Blöcke · 4 Sprecher · ~8–10 s".
   Liegt der Wert weiterhin über 10 s, die längsten Zeilen ein weiteres Mal kürzen
   und erneut prüfen.
3. Preflight/Kostenvoranschlag für S08 erneut ablesen (Erwartung unverändert
   €6.30, da preisbestimmend die 15-s-Plate ist, nicht die Dialoglänge).
4. Pre-Start-Snapshot read-only erneut bestätigen: `pipeline_state = idle`,
   `active_run_id = NULL`, alle Output-URLs NULL, Ledger-Jobs = 0.
5. Setup-Abschnitt in `docs/v433-motion-studio-final-acceptance.md` auf das neue
   Skript und die neue Prognose aktualisieren.
6. STOP — kein kostenpflichtiger Render.

## Verifikation

- Turn-Anzahl bleibt exakt 6, Sprecheranzahl exakt 4, Cast-Zuordnung bijektiv.
- Effektive Dialogdauer laut `resolveEffectiveDialog` deutlich unter der
  15-s-Plate, damit weder `dialog_too_long_for_plate` noch automatisches
  Duration-Clamping den 4-Speaker-Test verfälscht.
- Erwartete Job-Kardinalität unverändert: 6 × sync_segment → 1 × audio_mux →
  1 × Stitch.

## Ergebnis

FA-4 SETUP (v2) READY → STOP. Renderfreigabe erst nach deiner Bestätigung der
neuen Prognose.
