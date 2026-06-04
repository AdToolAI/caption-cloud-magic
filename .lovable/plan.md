**Kurzantwort:** Nein — die Pipeline ist aktuell nicht exakt so gebaut, wie Sync.so es öffentlich für Multi-Speaker-Lip-Sync vorgibt.

**Was gerade passiert**
- Der aktuelle Fehler ist kein „alle drei wurden an Sync.so geschickt und Sync.so hat abgelehnt“-Fall.
- Die Szene `4e7a0601-8b6e-4088-846d-edc12c3f72e0` wird bereits vorher geblockt:
  - `plate_target_face_missing_pass_0_speaker_Samuel Dusatko`
  - Face-Gate findet für Samuel in den geprüften Frames kein eindeutig passendes Zielgesicht.
- Das ist ehrlicher als vorher: Es wird nicht mehr fälschlich ein Video gebaut, in dem nur 1 von 3 Personen die Lippen bewegt.

**Do I know what the issue is?**
Ja. Das Kernproblem ist: Unsere 3-Sprecher-Pipeline ist eine eigene Multi-Pass-/Mask-Compositor-Architektur, während Sync.so für mehrere Sprecher öffentlich die Single-Request-`segments[]`-Architektur mit per-segment `optionsOverride.active_speaker_detection` beschreibt.

**Konkrete Abweichungen zur Sync.so-Doku**
1. Sync.so-Vorgabe für mehrere Sprecher:
   - ein `/v2/generate` Request
   - ein Video-Input
   - mehrere Audio-Inputs mit `refId`
   - `segments[]`
   - pro Segment `optionsOverride.active_speaker_detection` mit `frame_number + coordinates`
2. Unsere aktuelle Pipeline:
   - pro Sprecher ein eigener Sync.so-Request
   - pro Sprecher eine full-length WAV mit Silence
   - alle Requests laufen gegen dieselbe Master-Plate
   - danach werden die erfolgreichen Speaker-Outputs per Face-Mask-Compositor zusammengelegt
3. `sync-3` ist noch nicht als echter Fallback verdrahtet.
4. Der Retry `coords-pro-box` nutzt eine konstante Bounding-Box über alle Frames; Sync.so beschreibt Bounding-Boxes als per-frame Array passend zur gesamten Clip-Timeline. Formal ist ein Array vorhanden, aber inhaltlich ist es für dynamische 3-Personen-Plates zu grob.
5. In der älteren Audit-Spur ist außerdem sichtbar: `isAdvance`-Passes können Face-Gate/Repair überspringen. Das ist für 3+ Sprecher riskant, weil jeder Sprecher eigene Frames/Koordinaten braucht.

**Implementierungsplan**

1. **3+ Sprecher auf Sync.so-konforme Canonical Pipeline umstellen**
   - Für 3+ Sprecher nicht mehr Multi-Pass + Mask-Compositor als Standard verwenden.
   - Stattdessen einen einzigen Sync.so-Request bauen:

```text
input: [video, audio_speaker_1, audio_speaker_2, audio_speaker_3]
segments: [
  { startTime, endTime, audioInput.refId, optionsOverride.active_speaker_detection },
  ...
]
```

2. **Per-Segment Speaker Targeting korrekt erzeugen**
   - Für jeden Dialog-Turn den passenden Sprecher bestimmen.
   - Für jeden Turn einen Frame innerhalb dieses Turn-Fensters suchen, in dem dessen Gesicht sichtbar ist.
   - `frame_number` und `coordinates` aus genau diesem echten Plate-Frame ableiten.
   - Keine Anchor-only-Koordinaten mehr ungeprüft an Sync.so schicken.

3. **`sync-3` als Pflicht-Fallback für schwierige 3-Sprecher-Plates verdrahten**
   - Retry-Reihenfolge für 3+ Sprecher ändern:

```text
lipsync-2-pro canonical segments
→ sync-3 canonical segments
→ sauber fail + Refund + klare UI-Ursache
```

   - Keine `auto_detect`-Fallbacks bei 3+ Sprechern, weil das Sprecher vertauschen kann.

4. **Face-Gate als Vorprüfung behalten, aber nicht als Endlösung missbrauchen**
   - Wenn ein Sprecher-Gesicht nicht eindeutig gefunden wird, wird kein falscher Provider-Call gestartet.
   - Die UI zeigt dann gezielt: welcher Sprecher und welche Szene/Frame-Kandidaten nicht verwendbar waren.

5. **Alte Multi-Pass-Pipeline nur als Legacy-Fallback behalten**
   - Für 1 Sprecher: Single Sync.so Call bleibt.
   - Für 2 Sprecher: bestehende stabile Pipeline kann bleiben.
   - Für 3+ Sprecher: canonical Sync.so segments wird Standard.

6. **Status/Refund ehrlich halten**
   - `done/applied` nur wenn alle Pflichtsprecher in der canonical Sync.so-Ausgabe erfolgreich verarbeitet wurden.
   - Bei Provider-/Face-Gate-Failures wird idempotent refunded.
   - Kein Partial-Mux als finales Ergebnis für 3+ Sprecher.

7. **Betroffene Szene sauber zurücksetzen**
   - Szene `4e7a0601-8b6e-4088-846d-edc12c3f72e0` nach der Umstellung zurücksetzen.
   - Danach neu starten und Logs prüfen:
     - Payload enthält `segments[]`
     - jeder Audio-Input hat `refId`
     - jedes Segment hat per-speaker `optionsOverride.active_speaker_detection`
     - bei komplexer Plate wird `sync-3` statt wiederholtem `lipsync-2-pro` genutzt.

**Erwartetes Ergebnis**
- Entweder Sync.so erhält exakt die dokumentierte Multi-Speaker-Payload und alle Sprecher werden in einem Lauf verarbeitet,
- oder die Szene scheitert früh mit klarer Ursache und Refund, ohne ein halb funktionierendes Lip-Sync-Video zu erzeugen.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>