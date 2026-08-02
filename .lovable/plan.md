## Plan v370 — Cast-Block sauber bauen statt nachträglich reparieren

### Bestätigter Ist-Zustand (DB, letzter Fehl-Lauf)
Szene `6bf4e815…` (`ai-happyhorse`, `cinematic-sync`):
- `clip_error = [invalid_prompt_rejected] [prompt_repair_exhausted] … InvalidParameter - Could not process with this prompt.`
- **Prompt-Länge 591 Zeichen** → Länge ist als Ursache ausgeschlossen (Hard-Cap 520/900, Provider verträgt weit mehr).
- Gespeicherter Prompt:

```text
[Besetzung: Matthew Dusatko (Profil), Sarah Dusatko (Profil), Kailee (Profil)]
Exactly four people in frame: in frame: Samuel Dusatko.
Exactly four people in frame: Samuel Dusatko.
Each person appears exactly once …
```

Drei Defekte: deutscher `[Besetzung: …]`-Tag nicht entfernt, Cast-Klausel doppelt und in sich zerstört (`in frame: in frame:`), Zahl („four") widerspricht Namen (1 bzw. 3). Solche Selbstwidersprüche sind der typische `InvalidParameter`-Trigger.

### Die sauberste Umsetzung
Nicht noch eine Regex-Reparaturschicht oben drauf. Der Cast-Block wird **einmal strukturiert gebaut** — aus den Daten, die die Pipeline ohnehin schon sicher kennt (`assignmentLock` / `dialog_turns`, die laut v367 die einzige Wahrheit für Sprecheridentität sind) — und der Sanitizer fasst diesen Block danach nicht mehr an. Damit kann nichts verloren gehen: Besetzung, Anzahl, Tiefen-Staging und Kamera-Lock bleiben erhalten, nur die Textmontage wird deterministisch.

### Umsetzung

1. **Neuer Single-Source-Builder** `_shared/cast-clause.ts`
   - `buildCastClause({ names, count })` → genau ein Satz: `Exactly N people in frame: A, B, C.` Zahl immer == Anzahl der (deduplizierten) Namen.
   - `extractCastNames(text)` sammelt Namen aus `[Besetzung: …]`, `[Cast: …]` und aus bestehenden `Exactly N …`-Klauseln, dedupliziert case-insensitiv, entfernt Zusätze wie „(Profil)".

2. **Prompt-Zusammenbau in `compose-video-clips` (HappyHorse-Pfad)**
   - Cast-Namen primär aus `assignmentLock`/`dialog_turns` der Szene ziehen (nicht aus dem Prompttext), fallback auf `extractCastNames`.
   - Prompt in fester Reihenfolge komponieren: `castClause` → Szenenbeschreibung (ohne Cast-Reste) → Staging-Satz → Kamera-Lock. Alle bestehenden Inhalte bleiben, nur einmalig und widerspruchsfrei.

3. **Sanitizer entlasten** (`_shared/happyhorse-green-net.ts`)
   - Cast-Rescue in `compressLipReadyPlate` entfällt; stattdessen: vorhandene Cast-Klausel erkennen, herausnehmen, am Ende **genau eine** über `buildCastClause` wieder einsetzen (idempotent, auch bei mehrfachem Durchlauf).
   - Bracket-Stripping als eigener, immer laufender Schritt vor dem Satz-Pass — Namen vorher via `extractCastNames` gerettet, damit die Besetzung nicht verloren geht.
   - Satz-Dedupe zieht künftig auch über normalisierte Sätze (Groß/Klein, Doppel-Kolon), damit Varianten desselben Satzes zusammenfallen.

4. **Pre-Dispatch-Contract**
   - Kurze Prüfung direkt vor dem Replicate-Call: keine `[`-Tags, genau eine Cast-Klausel, Zahl == Namensanzahl, keine Duplikat-Sätze. Verletzung → Prompt wird aus den strukturierten Feldern neu gebaut (nicht abgebrochen), mit Log-Tag `cast_contract_rebuilt`.

5. **Regressionstests** (`_shared/happyhorse-rejection.test.ts`)
   - Der exakte Prompt oben als Fixture: Ergebnis enthält genau eine Cast-Klausel, kein `[`, Zahl == Namensanzahl, alle Originalnamen weiterhin vorhanden.
   - Idempotenz-Test: zweimaliges Sanitisieren liefert identischen Text.

### Was bewusst unverändert bleibt
v369 (Rejection-Klassifikation, einmaliger Repair-Retry, Refund, UI-Meldung) bleibt vollständig bestehen — v370 sorgt nur dafür, dass der abgeschickte Prompt gar nicht erst widersprüchlich ist. Lip-Sync-Pfad, Provider-Wahl (keine Auto-Migration, v176) und Staging-Regeln bleiben unangetastet.
