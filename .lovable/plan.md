# Phase 2 — Visual Continuity im Render-Pfad, ohne neue Schichten

Ziel: nahtlose Szenenübergänge produktiv schalten, ohne die Lip-Sync-Pipeline (v400) anzufassen. Kein neuer Guard, kein neuer Watchdog, kein zweiter Entscheidungsort. Die Folgefehler werden durch **eine Substitution** und **eine Zuständigkeitsregel** unmöglich gemacht, nicht durch zusätzliche Prüfungen.

## Der eine strukturelle Befund

Heute liest jede Provider-Verzweigung in `compose-video-clips` denselben Wert direkt aus der Szene: `scene.referenceImageUrl` ist gleichzeitig i2v-Startbild **und** Identitäts-Anker der Lip-Sync-Kette (Verträge „Anchor-Kohärenz" und T3/T5). Es gibt 12+ solcher Lesestellen (Hailuo, Kling, Wan, Seedance, Luma, Veo, HappyHorse, Vidu, …), jede mit eigenem `isI2V`-Ausdruck.

Genau daraus entstehen alle denkbaren Folgefehler: Sobald irgendwo ein Continuity-Frame in dieses Feld geschrieben würde, misst T5 die Geometrie auf einem Frame statt auf dem Anker, T6 vergibt Slots neu, T9 schlägt mit `face_gate_no_face` fehl. Ein Guard „bitte nicht überschreiben" wäre wieder eine Schicht. Die Lösung ist, dass **niemand mehr in dieses Feld schreibt** und die Provider ihr Startbild nicht mehr selbst aussuchen.

## Die Lösung: ein Wert, eine Quelle

1. **`scene.referenceImageUrl` wird schreibgeschützt durch Konstruktion.** Die drei heutigen Zuweisungen (Anchor-Komposition, Anchor-Job-Ergebnis, Anchor-Cache) bleiben unverändert — sie sind die Anchor-Auflösung T3 selbst. Danach existiert im Render-Pfad keine weitere Zuweisung, weil Continuity nie über dieses Feld läuft.

2. **Jede Provider-Verzweigung liest ab sofort `plan.imageInputs`** statt `scene.referenceImageUrl`. Der Plan kommt aus genau einem Aufruf von `resolveVisualInputs()`, direkt nach der Anchor-Auflösung, vor der ersten Provider-Verzweigung.

3. **Der Resolver liefert für Lip-Sync-Szenen per Definition den heutigen Wert.** Bei `requirements.lipSync === true` ist `imageInputs.firstFrame === scene.referenceImageUrl`, `endFrame` leer, Referenzen leer. Das ist keine Sonderbehandlung und kein Guard, sondern das Ergebnis der bereits implementierten Kerninvariante: Continuity kann einen geschützten Anker nicht verdrängen, also bleibt nur `match-cut` — und `match-cut` heißt „Anker unverändert".

Damit ist die Lip-Sync-Kette nicht „geschützt", sondern **unerreichbar**: es gibt keinen Codepfad mehr, über den ein Übergangsframe in die Geometriemessung gelangen könnte.

## Folgefehler und warum keiner offen bleibt

| Fehlerbild | Warum es nicht mehr entstehen kann |
| --- | --- |
| Geometrie auf falschem Bild (`face_gate_no_face`, `bbox_geometry_insane`) | T5 misst weiter auf `reference_image_url`; der Resolver schreibt dieses Feld nie. |
| Slot-Vertauschung nach Re-Render | `assignment_lock` und `face_layout_anchor_hash` bleiben unberührt, weil der Anker byte-identisch bleibt. |
| Geister-Ergebnisse alter Läufe | `beginSceneRun()` bleibt einziger Einstiegspunkt; der Resolver läuft **nach** T2 und erzeugt keine Artefakte. |
| Provider bekommt First-Frame und Referenzen gleichzeitig (Seedance `refExclusive`) | Der exklusive Slot ist in der Registry modelliert; der Resolver liefert `inputMode`, der Adapter setzt genau ein Feld. Kein „if provider === seedance" im Render-Pfad. |
| Continuity-Frame bei einem Modell ohne i2v-Slot | `inputMode: 'none'` + Warnung; der Adapter hat schlicht nichts zu setzen. |
| Übergang von einer fehlgeschlagenen Szene | Ohne fertigen Vorgängerclip gibt es keine `previousFrameUrl` → `match-cut`. Kein Zustand, keine Prüfung. |
| Stiller Qualitätsverlust durch unbrauchbaren letzten Frame | Der Übergangsframe wird bei der Frame-Extraktion gewählt (siehe unten), nicht nachträglich bewertet. |
| Doppelte Wahrheit UI ↔ Render | Die UI ruft denselben Resolver auf und zeigt genau das an, was gerendert wird. |

## Umfang der Änderungen

**Backend `supabase/functions/compose-video-clips/index.ts`**
- Resolver-Logik als `supabase/functions/_shared/visual-inputs.ts` (Portierung der bereits getesteten Frontend-Module, gleiche Datei-Semantik, damit UI und Render nicht auseinanderlaufen).
- Ein Aufruf pro Szene nach der Anchor-Auflösung; Ergebnis in `plan`.
- Ersetzen der `const isI2V = !!scene.referenceImageUrl` / `xInput.image = scene.referenceImageUrl` Paare durch `plan.imageInputs`. Reine Substitution, keine neue Verzweigung.
- Unverändert: `beginSceneRun`, `LIPSYNC_PROVIDERS`, v195-Anchor-Hardguard, Preview-Gate, Duration-Guards, Plate-Dispatch, Face-Gate, Webhook, Mux.

**Übergangsframe**
- `supabase/functions/_shared/transition-frame.ts`: extrahiert den Übergangsframe des Vorgängerclips über Remotion Lambda Stills (derselbe Weg wie die Motion-Probe — Replicate bleibt im gesamten Umfeld verboten) und wählt aus wenigen Kandidaten am Clipende den letzten brauchbaren (kein Fade-to-black, keine Bewegungsunschärfe). Ergebnis wird an der Szene abgelegt und beim Re-Render der Nachfolgeszene wiederverwendet.
- Für Seedance 2.5 entfällt die Extraktion, wenn `clip-reference` gewählt ist: dort geht der Vorgängerclip direkt als Referenzvideo in den Task.

**Frontend**
- `SceneCard`: Übergangswahl `Auto | Nahtlos | Identität | Schnitt` (schreibt `visualContinuity`).
- Anzeige des Resolver-Ergebnisses als Klartext („Nahtlos über Vorgängerclip", „Schnitt — Identitäts-Anker hat Vorrang"), inklusive Begründung bei verweigertem Nahtlos-Wunsch.

**Tests**
- Erweiterung der bestehenden Suite: Für jede Szene mit Lip-Sync-Intent muss der resolvierte Bildinput **identisch** zu `scene.referenceImageUrl` sein — über alle Registry-Modelle und alle Continuity-Wünsche hinweg. Dieser eine Test ersetzt jeden Laufzeit-Guard.
- Ein Parity-Test, der sicherstellt, dass keine Provider-Verzweigung mehr `scene.referenceImageUrl` direkt liest.

## Nicht Teil dieser Phase

Seedance 2.5 als Lip-Sync-Plate-Provider (Phase 3a) und jede Änderung an `LIPSYNC_PROVIDERS`, an T5–T14 oder am Watchdog. Die Allowlist bleibt exakt wie sie ist.
