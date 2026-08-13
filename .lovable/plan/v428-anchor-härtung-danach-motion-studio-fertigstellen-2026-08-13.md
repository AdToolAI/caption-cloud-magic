# v428: Anchor-Härtung, danach Motion Studio fertigstellen

Alle sieben Korrekturen sind eingearbeitet. Der alte, widersprüchliche Abschnitt (Guide überschreiben, Hash-Test, „kein Code an der Kette") ist ersatzlos gestrichen — dieses Dokument ist die einzige gültige Anweisung.

Und ja, ich verstehe deine Priorisierung: erst das Motion Studio zu Ende bauen, dann zurück an die Lip-Sync-Qualität (Outcome-Gate, Face-Gates, Framing). Die Anchor-Härtung ist kein Lip-Sync-Ausbau — sie ist die Bedingung dafür, dass am Motion Studio weitergearbeitet werden kann, ohne die laufende Kette zu gefährden. Deshalb steht sie vorn und ist eng begrenzt.

## Einordnung: kontrollierter, eng begrenzter Unfreeze

`compose-video-clips` steht im eingefrorenen Scope. Punkt A ändert diese Datei — das ist ein **kontrollierter Unfreeze, begrenzt auf die vorgelagerte Visual-Input-Auflösung und die Continuity-Backfill-Schleife**. Nicht angefasst: Preclip, Face-Slot-Routing, Sync.so-Dispatch, Reprojektion, Stitching, Gates, Schwellenwerte, Zustandsmaschine. Die Änderung verengt Verhalten und macht den Freeze strenger.

## Belegte Lücke

`slotArbitration.ts` schützt nur über `hasProtectedAnchor && collide`. Fällt eine der beiden Bedingungen weg, läuft eine Lip-Sync-Szene bis Schritt 3–5 durch und bekommt `endframe-bridge`, `clip-reference` oder `frame-chain`; `resolveVisualInputs.ts:103` setzt dann `firstFrameUrl = previousFrameUrl`. Plate aus Bild B, Geometrie auf Bild A — der Anchor-Mismatch von Juli. Bei Hailuo/HappyHorse kollidieren die Slots heute zufällig, der Schutz hängt also an einer Provider-Eigenschaft statt an der Lip-Sync-Absicht.

---

# Block 1 — Lip-Sync gegen v426 absichern

## Commit 1: nur Dokumentation und Tests

Kein Laufzeitcode. Neue Anchor-Tests dürfen hier **rot** sein — sie belegen die Lücke.

**Dokumente (nichts wird überschrieben):**
- `docs/archive/lipsync-pipeline-v400-freeze-original.md` — Guide vom 03.08., unverändert archiviert.
- `docs/lipsync-pipeline-v400-errata.md` — pro Punkt: Guide-Aussage, Befund am Freeze-Commit `cae9730f8`, heutiger Stand (24-%-Face-Gate, 144 px, 62-%-Mundposition, harte Maske 55–63 %, Passthrough-Erkennung, `mouth-motion-verdict.ts`, `rek-image-space.ts`, Watchdog-Stufen).
- `docs/lipsync-pipeline-current.md` — Ist-Spezifikation v425–v428.
- Ehrliche Bestandsaufnahme der vier Verträge: Run-Identität und Assignment-Lock vollständig, Anchor-Kohärenz im Hauptpfad korrekt aber (noch) nicht strukturell erzwungen, **Outcome-Gate nicht scharf** — nur Telemetrie, ein Passthrough kann heute als Erfolg durchlaufen.

**Tests (`src/lib/composer/__tests__/lipsyncAnchorCoherence.test.ts`):**

Verhaltenstests, keine Namensprüfungen. Für `requirements.lipSync === true` über **alle** Provider-Profile, mit/ohne Vorgängerframe, mit/ohne Endframe, mit Clip-Referenz:
- `anchorImageUrl === scene.reference_image_url`
- `firstFrameUrl === scene.reference_image_url`
- `previousFrameUrl` erscheint nicht im Plate-Payload
- `endFrameUrl` erscheint nicht im Plate-Payload
- `clipReference` erscheint nicht im Plate-Payload
- `lock_reference_url` beeinflusst weder Plate-Input noch Geometrie

**Differentialtest:** `reference_image_url = A`, `lock_reference_url = B`; danach `lock_reference_url = C`. Plate-Input und Geometrie zeigen in beiden Läufen auf A.

**Einstiegspunkt-Tests** — `requirements.lipSync` muss vor `arbitrateSlots` feststehen, je ein Test für: manuell aktiviertes Lip-Sync, Multi-Speaker-Dialog, Single-Speaker-Dialog, Replay/Regeneration, Watchdog-Recovery, bestehende Szene mit neuem Run, Autopilot-/Auto-Composer-Pfad.

**Vertragstests (erweitert):** alter Run überschreibt keinen aktuellen Clip · `plate_generation` muss übereinstimmen · Assignment-Lock nach Dispatch unverändert · gültiger Callback genau einmal · veralteter Callback verworfen · fehlgeschlagener Callback erneut zustellbar · Reservierung/Refund/Watchdog genau einmal · vier Sprecher ⇒ vier stabile Slots und vier Jobs.

**Vier-Sprecher-Fixture** aus dem Golden Run (Scene `c934a823…`): kreditfrei, ohne Provider-Aufruf, prüft Slots, Jobs, Run-ID, Generation, Reprojektionsgeometrie, Abrechnung.

## Commit 2: ausschließlich Anchor-Härtung

Drei Schutzschichten, keine davon per Flag abschaltbar:

1. `slotArbitration.ts` — neue Regel **vor** allen anderen Zweigen:
   `requirements.lipSync === true` → `transition = 'match-cut'`, Warnung `lipsync_continuity_disabled`.
2. `resolveVisualInputs.ts` — `useContinuityFrame` kann bei `requirements.lipSync` nicht wahr werden.
3. `compose-video-clips/index.ts` — die Continuity-Backfill-Schleife (~Z. 3843) überspringt Lip-Sync-Szenen; es wird gar kein Frame extrahiert. Backend-Spiegel `_shared/visual-inputs.ts` identisch.

**Anchor-treuer Input, fail-closed:** kein Fallback auf `references` als Notlösung. Es wird der provider-spezifische, im v425-Vertrag als Lip-Sync-tauglich zertifizierte Image-Input verwendet. Gibt es keinen anchor-treuen Image-Input, bricht die Szene mit `lipsync_anchor_input_unsupported` ab, statt auf eine lose Referenzart auszuweichen. Diese Zuordnung wird zentral im v425-Provider-Vertrag hinterlegt.

Danach müssen Anchor-, Parity-, Freeze- und Vier-Sprecher-Tests grün sein.

## Staging-Canary (vor Commit 3)

Vier-Sprecher-Konfiguration vom 03.08.: vier richtige Gesichter, vier richtige Stimmen, vier Jobs, korrekte Run-ID und Generation, richtige Reprojektion, **kein Vorgängerframe im Payload**, Credits genau einmal.

## Commit 3: Callback-Guard, ausschließlich observe

Vier Zustände: `received`, `processing`, `succeeded`, `failed_redeliverable`. Ein Callback gilt erst nach erfolgreicher Verarbeitung als konsumiert; scheitert sie, bleibt er erneut zustellbar. Reihenfolge unverändert: `run_guard_discarded` zuerst, Guard danach.

**Observe ist fail-open und wird als solches getestet:** der Guard darf protokollieren, aber niemals einen Callback verwerfen, verzögern, als konsumiert markieren oder die Verarbeitung wegen eines eigenen Schreibfehlers abbrechen. Duplikatsperre erst nach ausdrücklicher Aktivierung von `enforce`. Getrennter Runtime-Commit, nie zusammen mit Commit 2.

## Commit 4: separat

Die zwei Altfehler in `visualInputsResolver.test.ts` (Seedance-Zertifizierungsstatus) an den v425-Vertrag angleichen. Eigener Commit, damit ein späterer roter Lauf eindeutig zuzuordnen ist.

## Produktionsdeploy

Flag-Zustände dokumentieren · nie zwei Flags gleichzeitig umschalten · `lipsync-selftest` vor dem Deploy · Deploy (`compose-video-clips`, `compose-clip-webhook`) · Selftest danach · ein echter Vier-Sprecher-Lauf · Ledger, Callback-Reihenfolge und Credit-Abschluss kontrollieren.

---

# Block 2 — Motion Studio fertigstellen

Erst wenn Block 1 grün ist. Offen aus dem v427-Vertrag:

- **B (Geld & Dauer, gebaut, nicht aktiv):** `v427.credit_reservations` und `v427.audio_preflight` auf dem Betreiber-Account testen — Reservierung vor Dispatch, exakte Abrechnung danach, genau eine Buchung pro Lauf. Offene Produktentscheidung: Wer trägt die TTS-Kosten, wenn der gemessene Dialog in kein Providerfenster passt (Hailuo 10 s, HappyHorse 15 s, Seedance 30 s)?
- **C (Fertig-Semantik):** `base_clip_ready` (Bild fertig) vs. `ready` (Mux fertig). Die Kontinuitätskette startet den Folgeclip schon bei fertiger Bildbasis. Consumer aus `docs/v427-ready-consumers.md` umstellen, Flip hinter `v427.ready_semantics`.
- **D (Leases & UI):** `v427.provider_leases` gegen Doppelbuchung desselben Providerslots, Storyboard-Persistenz, Fortschrittsanzeige vollständig aus `pipeline_state`.
- **Rollout A2/A3:** Dual-Write und Guard von `observe` auf `enforce`, nachdem mehrere Läufe keine Ablehnung gegen gültige Callbacks gezeigt haben.

# Block 3 — später, nur mit ausdrücklichem Unfreeze

Outcome-Gate scharf schalten (`static` failt, `unknown` blockiert Mux), Face-Gate-Schwellen, 62-%-Framing, harte Maske. Bleibt bewusst offen und wird **nicht** zusammen mit der Anchor-Reparatur angefasst. Bis dahin wird die vorhandene Telemetrie nur ausgewertet.

## Technische Notizen

- Betroffene Dateien Block 1: `src/lib/composer/visualInputs/slotArbitration.ts`, `resolveVisualInputs.ts`, `supabase/functions/_shared/visual-inputs.ts`, `supabase/functions/compose-video-clips/index.ts` (nur Backfill-Schleife), `supabase/functions/_shared/v427-callback-guard.ts` (Commit 3), `_shared/composer-ai-sources.ts` (anchor-treuer Input im v425-Vertrag).
- Der Freeze-Guard-Test (10/10) und `visualInputsParity` bleiben Abnahmebedingung jedes Commits.
- Einziger echter `lock_reference_url`-Lesepfad: `compose-dialog-segments/index.ts:1362`. Er bleibt unverändert, wird aber vom Differentialtest abgedeckt.
