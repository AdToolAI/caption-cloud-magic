# V475 — MASTER-AUDIT: v400-Konformität der heutigen Pipeline (READ-ONLY)

Stand: 2026-08-24. Grundlage: `docs/lipsync-pipeline-v400.md` + `docs/lipsync-pipeline-v400-errata.md`.
Kein Codeeingriff, kein Provider-Call, kein Rerender. Jede Zeile mit Codebeleg.

Statuswerte: `ERFÜLLT` / `ABGEWICHEN` / `FEHLT` / `ÜBERSCHRIEBEN`.

---

## 1. Grundverträge (v400 §0)

| v400-Vertrag | Status heute | Beleg | Abweichung beabsichtigt? | Kann Ausfall erklären? |
|---|---|---|---|---|
| Run-Identität (`active_run_id`, `plate_generation`) | ERFÜLLT | `_shared/scene-run-begin.ts:124-149` (Counter +1, `clip_status='generating'`), Webhook liest beides (`sync-so-webhook/index.ts:611,627`) | — | nein |
| Anchor-Kohärenz (Geometrie nur auf `reference_image_url`) | ERFÜLLT | `_shared/generated-anchor.ts:6,159-167`; v400-Regel seit Rollback unverändert | — | nein |
| Assignment-Lock (row-major, `dialog_turns` = Wahrheit) | ERFÜLLT | `_shared/plateFaceSlotRouter.ts`, v201-Kanonisierung aktiv | — | nein |
| Outcome-Gate („Output muss messbar vom Input abweichen") | **ABGEWICHEN** | v400 §12: `moving/static/unknown`; heute `mouth_over_frame` mit 2.00/2.65 (`_shared/v465-verdict.ts:19-21,40-41`) | ja (V465-B2b freigegeben) | **ja — Hauptkandidat** |

---

## 2. Die fünf priorisierten Prüfpunkte

### P1 — T8 Mouth-Priority-Framing

| Aspekt | v400 | heute | Beleg |
|---|---|---|---|
| Anker | Mund-Landmark, Fallback BBox-Zentrum | identisch | `compute-mouth-centered-crop.ts:11-13`, `anchor: "mouth" \| "face_center"` |
| `targetFaceShare` | 0.42 | 0.42 | `compute-mouth-centered-crop.ts:165` |
| `outputSize` | 720 px | 720 | `:167` |
| `minSize` | **128 px** | **96 px** | `:166` |
| Mund bei 62 % Preclip-Höhe | **existiert nicht** im Freeze-Stand | nicht implementiert | `lipsync-pipeline-v400-errata.md`: „Kein fester Faktor. Zentriert auf den Mundpunkt mit gesichtsproportionaler Marge." |

**Status: ERFÜLLT mit einer Abweichung (`minSize` 128 → 96).**

Wichtige Klarstellung zur 62-%-Frage: Der Guide-Satz „Mundhöhe wird auf 0.62 der Crop-Höhe
normiert" ist bereits in der v400-Errata offiziell **zurückgezogen**. Der Freeze-Stand
zentriert den Crop auf den Mund, d. h. der Mund liegt konstruktiv bei ≈ **50 %** der
Preclip-Höhe, nicht bei 62 %. Heute gilt dasselbe, mit einer Zusatzverschiebung durch
V457 (`containBox`-Projektion), die den Mund aus der Mitte schieben *kann* —
ausschließlich, um die Dispatch-Box vollständig einzuschließen (`:29-33`, `containReason`).
Damit gibt es hier **keinen** Drift gegen den echten v400-Vertrag; ein Drift bestünde nur
gegen den zurückgezogenen Guide-Text.

`minSize` 96 statt 128 ist ein unbeabsichtigter Drift, aber praktisch wirkungslos: die
Crop-Größe wird durch `idealSide = faceSide / sqrt(0.42)` bestimmt (`:182-184`) und liegt
bei realen 1080p-Plates weit über beiden Werten. **Kann den Ausfall nicht erklären.**

### P2 — T9 Face-Gate

| v400 | heute | Beleg |
|---|---|---|
| Gesichtsanteil-Floor | `face_share ≥ 0.24`, hart | `_shared/v461-face-gate.ts:31` (`V461_FACE_SHARE_FLOOR = 0.24`), Prüfung `:199` |
| Mindestgröße | `≥ 144 px` Provider-Pixel | `:33`, Prüfung `:217` |
| Mund nicht am Rand | unclamped Mouth-ROI muss vollständig im Crop liegen | `:110-135`, `:232-239` |
| Fail-closed, kein stiller Retry | erfüllt, sprechender Code | `evaluateV461FaceGate` liefert Block-Reason |

**Status: ERFÜLLT (V461 = v400-Parität).** Einschränkung: die Errata sagt, der 0.24-Floor
galt im Freeze-Stand **nur für Mehrsprecher**-Preclips (v331); V461 wendet ihn generell an.
Das ist eine bewusste Verschärfung für Einzelsprecher-Szenen. S01 ist mehrsprecherig →
für den aktuellen Ausfall irrelevant.

**Zusätzlich, nicht in v400: V469** (`_shared/v469-mouth-visibility-gate.ts`).
Blockt bei `usable_frame_rate < 0.35` (`:55`), Yaw ist ausdrücklich **nur Telemetrie**
(`:96-97,165-166`). Beabsichtigte Verschärfung, dokumentiert. Für S01-P0 laut V472
nicht auslösend (`usable_frame_rate = 1.00`) → **erklärt den Ausfall nicht**.

### P3 — T12 Outcome-Gate — **größter konzeptioneller Drift**

| v400 | heute |
|---|---|
| Frames aus Input und Output, Mundregion-Delta im Konsens | gleiche Extraktion (AWS Lambda Stills, Replicate verboten) |
| `moving` → weiter | `mouth_over_frame > 2.65` → `motion` |
| `static` (Output ≈ Input) → `failed` | `mouth_over_frame < 2.00` → `noop` → `ssw:noop_fail` |
| `unknown` → blockiert Mux, nie durchgewunken | `indeterminate` → V466: einmalige N=16-Nachmessung, danach `motion_unverified` = **Erfolgsdurchlauf** |

Belege: `_shared/v465-verdict.ts:19-21,40-41,47-50,66,75`; `sync-so-webhook/index.ts:897-932,
1694,1711-1784`.

Zwei getrennte Drifts:

1. **Fehlschlag-Definition.** v400 verlangt „Output ≈ Input" (absolute Ähnlichkeit).
   Heute ist der Vertrag ein **Verhältnis**: Mund-Edit relativ zur Gesamtbildbewegung.
   Ein Output, der v400-seitig eindeutig `moving` wäre (Mund wurde messbar verändert —
   V466-B hat für **alle** S01-Pässe Edits exakt im Mundband nachgewiesen), kann heute
   `noop` werden, wenn der Nenner (globale Plate-Bewegung) groß genug ist.
   **Beabsichtigt: ja** (V465-B2b freigegeben). **Kann den Ausfall erklären: ja.**
2. **`unknown`-Semantik umgedreht.** v400: `unknown` blockiert. Heute: Grauband nach
   Re-Measure läuft als `motion_unverified` durch. Beabsichtigt (V443/V466), Richtung
   ist *permissiver* als v400 → **kein** Ausfallgrund, im Gegenteil.

Genau Punkt 1 ist die Hypothese, die V473 empirisch prüft.

### P4 — T4 Prompt-/Action-Propagation

Kette bis zum Provider-Request nachvollzogen:

```text
UI  → applyActionsToPrompt (src/lib/motion-studio/applyActionsToPrompt.ts)
    → [SceneAction]/[CastActions] am Prompt-Anfang
    → ai_prompt (persistiert)
    → compose-video-clips: withServerCastActions()  (index.ts:1248-1254)
    → buildCinematicSyncMasterPrompt()               (:1409-1546)
    → stripDialogForAnchor → stripFaceOcclusionForPlate → stripCameraMotionForPlate
    → Hailuo (:4628) / HappyHorse (:5420) Request
```

Befunde mit Beleg:

- Der Aktionstext **erreicht T4**. Marker-Blöcke werden gegen die Anchor-Stripper explizit
  geschützt (`:1009-1018`), serverseitig nachgezogen, wenn der Client sie nicht geschrieben
  hat (`:1248-1254`), und Green-Net entfernt nur die **Tags**, nicht den Satz
  (`_shared/happyhorse-green-net.ts:25` → Ersatz `""` auf `\[/?SceneAction\]`).
- **Aber:** Der Text landet im Plate-Prompt als `sceneDescription` und wird dort von
  Stillstands-Klauseln umschlossen. Für N ≥ 2 endet der Prompt wörtlich mit:
  „All visible characters keep their mouths softly closed … heads stay steady — no nodding,
  no head bobbing." (`:1546`). Für N = 1 zusätzlich „LOCKED static camera … no reframing"
  (`:1533`), plus `stripCameraMotionForPlate` (`:1367-1392`).
- Der Stripper entfernt **nur Kamerabewegung**, keine Körperbewegung („walks", „turns",
  „takes documents" bleiben stehen) — nachgeprüft an der Musterliste `:1371-1392`.
- Für N ≥ 4 fordert der Prompt sogar aktiv „Preserve the positions and actions described
  for each person" (`:1305`), für N = 3 mit asymmetrischer Regie ein Depth-Staging (`:1296`),
  ausgelöst von `hasAsymmetricCastDirection` (`:1263-1272`).

**Status: ERFÜLLT für die Durchreichung, ABGEWICHEN in der Gewichtung.** Die Regie erreicht
den I2V-Prompt, konkurriert dort aber mit einem harten Ruhe-/Statik-Block, der bewusst
für Lip-Sync-Plates eingeführt wurde (v166/v171/v173/v182). Das ist die plausibelste
Erklärung dafür, dass die Figuren die Regie nicht ausführen — und **kein** Datenverlust.
Detailnachweis am realen Request folgt in V474.

Zweiter Befund für V474: Per-Character-Aktionen kommen aus
`character_shots[].actionEn/actionUser` (`:1229-1231`). Sind diese Felder leer — wie im
Screenshot —, entsteht **kein** `[CastActions]`-Block; es bleibt allein der Szenensatz.

### P5 — Watchdog

| v400-Konstante | Wert v400 | Wert heute | Beleg |
|---|---|---|---|
| `STALE_PREFLIGHT_MS` | 4 min | 4 min | `lipsync-watchdog/index.ts:62` |
| `STALE_PROVIDER_MS` | 10 min | 10 min | `:61` |
| `STALE_AUDIO_MUX_MS` | 6 min | 6 min | `:74` |
| `STALE_HARD_MS` | 25 min | 25 min | `:63` |
| `STALE_DISPATCH_RECOVERY_MS` | 30 s | 30 s | `:69` |
| `RECOVERY_COOLDOWN_MS` | 90 s | 90 s | `:768` |

**Status: ERFÜLLT.** Alle sechs Konstanten sind wertidentisch. Die zusätzlichen Zustände
(Ladder, virtual in-flight, Preflight-Recovery, Fan-out-Fence, `motion_unverified`,
Reconciliation) hängen alle unterhalb von `STALE_HARD_MS` (`:862`), das unverändert
absolut terminalisiert und refundiert. Die v400-Invariante „kein Run bleibt dauerhaft
hängen" ist gewahrt. **Erklärt den Ausfall nicht** — die S01-Läufe terminalisieren, sie
hängen nicht.

---

## 3. Restliche v400-Punkte

| v400 | Status | Beleg | Beabsichtigt? | Erklärt Ausfall? |
|---|---|---|---|---|
| T1 Trigger, optimistisches Leeren | ERFÜLLT | `ClipsTab.tsx` → `compose-video-clips` | — | nein |
| T2 `beginSceneRun` als einziger Einstieg | ERFÜLLT | `scene-run-begin.ts:14-19,66,163` | — | nein |
| T3 Anchor aus `brand_characters`, ein Bild | ERFÜLLT | `generated-anchor.ts` | — | nein |
| T4 Provider-Liste | ÜBERSCHRIEBEN | v425: nur HappyHorse + Hailuo zertifiziert (Errata) | ja | nein |
| T4 Kontinuität | ÜBERSCHRIEBEN | v428: für Lip-Sync-Szenen hart deaktiviert, Plate-Input ist immer der Anker | ja | nein |
| T5 Rekognition auf Anchor, Plausibilitätsfilter | ERFÜLLT | v400-Kern unverändert | — | nein |
| T6 row-major, kein Fuzzy-Match | ERFÜLLT | `plateFaceSlotRouter.ts`, v201 | — | nein |
| T7 ElevenLabs, DE-Hard-Lock, `silence_track.wav`, Run-Bindung | ERFÜLLT | v447 hat die DE-Locks wiederhergestellt | — | nein |
| T10 `model=sync-3`, `sync_mode=cut_off`, ASD mit Boxen, `auto_detect=false` | ERFÜLLT | `compose-dialog-segments/index.ts:314,331-341,537-564` | — | nein |
| T10 Parallelität max. 4 | ERFÜLLT | `:8931,8946` (`concurrencyCap = 4`, hart geklemmt) | — | nein |
| T10 ASD-Boxen | ABGEWICHEN | v464: **pro Frame** projizierte Boxen statt einer konstanten Box | ja (V464-B) | nein — repariert einen echten Vertragsbruch |
| T11 Run-Guard `run_guard_discarded` | ERFÜLLT | `sync-so-webhook/index.ts:672` | — | nein |
| T12 Frames nur via AWS Lambda Stills | ERFÜLLT | v347-Guard aktiv, Replicate verboten | — | nein |
| T13 Maske `30 %/78 %`, Faktoren 2.2/0.6 | ERFÜLLT | `src/remotion/templates/DialogStitchVideo.tsx:297,373-375,430,502,573` | — | nein |
| T14 Mux, `rawMediaMode`, 5 Worker, `framesPerLambda=270` | ERFÜLLT | Lambda-Policy unverändert | — | nein |
| T15/T16 `composer_scene_transition()` + Guard-Trigger | ERFÜLLT | DB-Funktion aktiv | — | nein |

---

## 4. Fehlercode-Referenz (v400 §17)

| Code | heute vorhanden | Anmerkung |
|---|---|---|
| `v204_preclip_required` | ja | unverändert |
| `preclip_face_share_too_low` | ja | jetzt über V461 mit demselben Floor 0.24 |
| `face_gate_mouth_at_edge` | ja | V461 `mouth_roi`-Prüfung |
| `face_gate_no_face` | ja | unverändert |
| `provider_passthrough` | **ersetzt** | heute `ssw:noop_fail` aus dem V465-Verdikt — semantisch nicht deckungsgleich (Verhältnis statt Ähnlichkeit) |
| `run_guard_discarded` | ja | unverändert, kein Fehler |
| `bbox_geometry_insane` | ja | unverändert |

Neue Codes ohne v400-Entsprechung: `ssw:noop_fail` (T12-Ersatz),
`lipsync_input_contract_violation` (V469), `preclip_mouth_not_visible` (V469),
`preclip_identity_geometry_mismatch` (V457), `v464_asd_contract_invalid` (V464),
`motion_probe_indeterminate` / `motion_unverified` (V443/V466).

---

## 5. Ergebnis — Drift, sortiert nach Erklärkraft

1. **T12 Outcome-Gate: Verhältnis statt Ähnlichkeit (beabsichtigt, aber unbewiesen als
   Terminalitätskriterium).** Einziger Drift, der die aktuellen 6/6-Abbrüche vollständig
   erklären kann. V466-B hat belegt, dass alle S01-Pässe das Mundband editieren — nach
   v400 wären sie `moving`. Heute terminalisieren sie unter 2.00.
   → geht direkt in **V473**.
2. **T4 Regie-Gewichtung: Aktion erreicht den Prompt, wird aber von Stillstands-Klauseln
   überlagert (beabsichtigt).** Erklärt nicht den Lip-Sync-Ausfall, aber die fehlende
   Regie im Bild — und indirekt Punkt 1, weil ruhige Plates das Verhältnis anders
   belasten als bewegte.
   → geht direkt in **V474**.
3. **T8 `minSize` 128 → 96 (unbeabsichtigt, wirkungslos).** Einziger echt unbeabsichtigte
   Drift des Audits. Kein Handlungsdruck, aber protokolliert.
4. **T9 Face-Share-Floor jetzt auch für Einzelsprecher (beabsichtigt).** Für S01
   irrelevant.

Alles andere — Run-Identität, Anchor-Kohärenz, Assignment-Lock, T10-Dispatch-Vertrag,
Run-Guard, Reprojektionsmaske, Mux, Watchdog-Konstanten — ist zu v400 **deckungsgleich**.
Die Pipeline ist also nicht breit weggedriftet; sie ist an genau **einer** entscheidenden
Stelle neu definiert worden: der Definition von „Fehlschlag".

**V475 = PASS (READ-ONLY, keine Codeänderung).**
