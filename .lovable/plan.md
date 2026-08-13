# Lip-Sync-Absicherung v428: Anchor-Härtung, Dokumententrennung, Vertragstests

Dein Review ist an den entscheidenden Stellen berechtigt. Ich habe die drei Kritikpunkte am Code nachgeprüft — zwei bestätigen sich, einer ist enger als befürchtet. Der Plan wird entsprechend umgestellt: kein Überschreiben des Guides, kein Datei-Hash-Test, dafür eine echte Härtung an der Kontinuitätskette.

## Nachprüfung (Belege)

**1. Meine Aussage „alle vier Verträge intakt" war zu weit.** Korrekt ist: Run-Identität und Assignment-Lock sind vollständig, Anchor-Kohärenz ist im Hauptpfad korrekt, aber nicht strukturell erzwungen, und das Outcome-Gate ist nicht scharf (`report-lipsync-motion-probe` ist reine Telemetrie, `mouth-motion-verdict.ts` existiert nicht — auch nicht am Freeze-Commit). Ein Passthrough kann heute als Erfolg durchlaufen.

**2. Die v426-Lücke existiert wirklich — im Code, nicht nur theoretisch.** In `slotArbitration.ts` greift der Schutz `hasProtectedAnchor && collide` → `match-cut`. Fällt eine dieser beiden Bedingungen weg, läuft eine Lip-Sync-Szene weiter durch bis Schritt 3–5 und kann `endframe-bridge`, `clip-reference` oder `frame-chain` bekommen. In `resolveVisualInputs.ts` Zeile 103 wird dann `firstFrameUrl = previousFrameUrl` — also Plate aus Bild B, Geometrie später auf `reference_image_url` = Bild A. Genau der Anchor-Mismatch von Juli. Bei Hailuo/HappyHorse kollidieren die Slots zwar (beide `image-input`), sodass der Regelfall heute `match-cut` liefert — aber der Schutz hängt an einer Slot-Eigenschaft des Providers, nicht an der Lip-Sync-Absicht. Das ist zu fragil.

**3. Nur ein echter `lock_reference_url`-Lesepfad ist relevant:** `compose-dialog-segments/index.ts:1362` (`lockAnchorUrl`). Die übrigen Treffer sind Schreibpfade oder Kommentare. Der Lesepfad gehört unter einen Test gestellt, der belegt, dass er nie Geometriequelle wird.

## Was umgesetzt wird

### A. Harte Regel: Continuity aus bei Lip-Sync (Verhaltensänderung, klein und gerichtet)

In `slotArbitration.ts` kommt eine Regel **vor** allen anderen Zweigen:

```text
requirements.lipSync === true
  → transition = 'match-cut'
  → inputMode  = firstFrame.supported ? 'first-frame' : 'references'
  → warning    'lipsync_continuity_disabled'
```

Damit ist der Plate-Input einer Lip-Sync-Szene immer der Anchor — unabhängig von Provider-Slots, Flags oder Reihenfolge. In `resolveVisualInputs.ts` wird zusätzlich abgesichert, dass `useContinuityFrame` bei `requirements.lipSync` niemals wahr werden kann. Beides gilt auch bei aktivierten v426/v427-Flags; ein Flag kann diese Regel nicht aufheben.

Dieselbe Regel spiegelt der Dispatcher: die Server-Kontinuitäts-Backfill-Schleife in `compose-video-clips` (Zeile ~3843) überspringt Lip-Sync-Szenen, damit gar kein Continuity-Frame extrahiert wird.

### B. Dokumente trennen statt überschreiben

- `docs/archive/lipsync-pipeline-v400-freeze-original.md` — der Guide vom 03.08., unverändert.
- `docs/lipsync-pipeline-v400-errata.md` — pro Punkt: Guide-Aussage, Befund am Freeze-Commit `cae9730f8`, heutiger Stand. Betrifft 24-%-Face-Gate, 144 px, 62-%-Mundposition, harte Maske 55–63 %, Passthrough-Erkennung, `mouth-motion-verdict.ts`, `rek-image-space.ts`, Watchdog-Stufen.
- `docs/lipsync-pipeline-current.md` — Ist-Spezifikation inklusive v425–v428 und dem neuen Continuity-Ausschluss.

Kein bestehendes Dokument wird inhaltlich umgeschrieben.

### C. Semantische Vertragstests statt Hash-Test

Der Datei-Hash-Test entfällt. Neue Vitest-Suite `src/lib/composer/__tests__/lipsyncAnchorCoherence.test.ts` und Erweiterung der bestehenden Contract-Tests:

- Lip-Sync-Szene ⇒ `transition = match-cut` und `firstFrameUrl === anchorImageUrl` — über alle Provider-Profile, mit und ohne Vorgängerframe, mit und ohne Endframe, mit Clip-Referenz.
- Geometriequelle einer Lip-Sync-Szene ist `reference_image_url`; `lock_reference_url` erscheint in keinem Mess-Aufruf.
- Assignment-Lock wird nach Dispatch nicht neu berechnet.
- Alter Run überschreibt keinen aktuellen Clip; `plate_generation` muss übereinstimmen.
- Callback: gültig genau einmal verarbeitet, veraltet verworfen, fehlgeschlagen erneut zustellbar.
- Reservierung: Erfolg verbraucht, Fehler gibt frei, verspäteter Callback und Watchdog buchen kein zweites Mal.
- Vier Sprecher ⇒ vier stabile Slots, vier Provider-Jobs.

### D. Callback-Guard: Zustände trennen

`v427-callback-guard.ts` bekommt statt „geclaimt / Duplikat" vier Zustände: `received`, `processing`, `succeeded`, `failed_redeliverable`. Ein Callback wird erst nach erfolgreicher Verarbeitung endgültig konsumiert; scheitert die Verarbeitung, bleibt er erneut zustellbar. Reihenfolge bleibt: `run_guard_discarded` zuerst, Guard danach. Der Guard bleibt auf `observe` bis der Referenzlauf grün ist.

### E. Vier-Sprecher-Referenztest

Kreditfreier Fixture-Test aus dem Golden Run vom 03.08. (Scene `c934a823…`): feste Anchor-Bilder, feste Dialogreihenfolge, erwartete vier Slots, vier Jobs, Run-ID/Generation, Reprojektionsgeometrie, Kreditabrechnung genau einmal. Läuft in CI ohne Provider-Aufruf. Der echte Staging-Canary bleibt manuell, vor jeder Flag-Aktivierung.

## Was ausdrücklich nicht passiert

- Kein Reaktivieren von 24 %, 144 px, 62-%-Framing oder harter Maske.
- Kein Scharfschalten des Outcome-Gates. Die Telemetrie wird erst ausgewertet; das scharfe Gate braucht deine ausdrückliche Freigabe und wäre ein Unfreeze.
- Keine Änderung an Gates, Payloads, Retry-Verhalten oder Zustandsmaschine der Kette.
- Kein Flag-Rollout: v426/v427-Flags bleiben stehen, wo sie stehen, bis der Vier-Sprecher-Referenzlauf mit den neuen Tests grün ist.

## Technische Notizen

- Punkt A ist die einzige Laufzeitänderung. Sie verengt Verhalten (Continuity aus bei Lip-Sync) und kann keine neue Bildquelle einführen — der Freeze wird dadurch strenger, nicht lockerer. Sie berührt keine der in `.lovable/LIPSYNC-FEATURE-FREEZE.md` gelisteten Dateien der Kette selbst, sondern nur die vorgelagerte Input-Auflösung.
- Betroffen: `src/lib/composer/visualInputs/slotArbitration.ts`, `resolveVisualInputs.ts`, der Backend-Spiegel `supabase/functions/_shared/visual-inputs.ts`, die Backfill-Schleife in `compose-video-clips/index.ts`, `_shared/v427-callback-guard.ts`.
- Deploys danach: `compose-video-clips`, `compose-clip-webhook`. `lipsync-selftest` vorher und nachher.
- Der Freeze-Guard-Test (10/10) und `visualInputsParity` müssen grün bleiben; die zwei bekannten Altfehler in `visualInputsResolver.test.ts` (Seedance-Zertifizierungsstatus) werden im selben Zug an den v425-Vertrag angeglichen.
