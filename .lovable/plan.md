# Visual-Continuity-System für Motion Studio

Die vier Verschärfungen sind berechtigt und werden übernommen. Kernkorrekturen gegenüber der vorigen Fassung:

- **Ein Resolver, keine zweite Instanz.** Transition Resolver, Anchor Strategy, Reference Budget und Compatibility Guards liegen *im* `VisualInputResolver`. Er gibt einen fertigen `ResolvedVisualPlan` zurück; die Renderroute enthält keine Continuity-Logik mehr.
- **Slot-Topologie statt Boolean.** Jeder Bildinput trägt einen Slot-Namen. Gleicher Slot = Konflikt, verschiedener Slot = koexistiert. Kein `firstFrameConsumesReferenceSlot`.
- **Kein „Lip-Sync = immer Match-Cut".** Die Regel lautet ausschließlich: *ein geschützter Identitäts-/Sync-Anker wird niemals für Übergangskontinuität geopfert.* Match-Cut ist die Folge eines Slot-Konflikts, keine Hardcode-Regel.
- **Relevanz statt statischem Rang** beim Reference Budget.

## Zielarchitektur

```text
STORYBOARD
   ↓ Scene Requirement Analysis
   ↓ Visual Scene Classification
   ↓ Character / Product / Location Anchors
   ↓ Model Capability Profile
   ↓ ┌────────────────────────┐
     │ VisualInputResolver    │
     │  Anchor Strategy       │
     │  Transition Strategy   │
     │  Reference Selection   │
     │  Slot Arbitration      │
     │  Compatibility Guard   │
     └────────────────────────┘
   ↓ ResolvedVisualPlan
   ↓ Provider Adapter  (übersetzt nur, entscheidet nichts)
   ↓ Render
```

Der Provider-Adapter ersetzt die heutige Lage, in der jede `generate-*-video`-Function ihre Bildinputs selbst wählt und `compose-video-clips` zusätzlich eine providerspezifische `if/else`-Kette führt.

## 1. Scene Classification

```ts
type VisualSceneClass = 'environment' | 'product' | 'character' | 'lipsync-character';
// 'mixed' bleibt als spätere Erweiterung offen
```

Die Klasse bestimmt die Priorität bei knappem Slot:
- `environment` → Übergang vor Location
- `product` → Produkt oder Übergang, je nach Hero-Status
- `character` → Identität vor Übergang
- `lipsync-character` → Sync-/Identitäts-Anker vor allem anderen

## 2. Registry: Slot-Topologie

```ts
visualInputs: {
  firstFrame: { supported: true, slot: 'first-frame' },
  endFrame:   { supported: false },
  references: { max: 30, slot: 'references', character: true, product: true, location: true },
  lipSync:    { supported: true, requiresIdentityReference: true, verified: false },
}
```

Konkurrierender Provider:

```ts
firstFrame: { supported: true, slot: 'image-input' },
references: { max: 1, slot: 'image-input' },
```

Zwei Wahrheitsgrade: `supported` (laut Doku) und `verified` (im echten Lauf bestätigt). Auto nutzt nur `verified`-Fähigkeiten; `supported && !verified` erscheint als manuell wählbare Option mit Hinweis. Damit lassen sich später `character_ref`, `subject_ref`, `style_ref`, `start_image`, `end_image`, `video_ref` als weitere Slots ergänzen, ohne das Modell umzubauen.

## 3. ResolvedVisualPlan

```ts
{
  transition: { mode: 'frame-chain' | 'endframe-bridge' | 'match-cut', sourceFrameUrl?: string },
  anchors: { identity: [...], product: [...], location: [...] },
  references: [...],          // bereits budgetiert und auf max gekürzt
  endFrameUrl?: string,
  anchorStrategy: 'transition-priority' | 'identity-priority' | 'product-priority' | 'balanced',
  constraints: { identityProtected: boolean, lipSyncProtected: boolean },
  warnings: string[],
}
```

Slot-Arbitrierung: belegen First Frame und der Identitäts-Anker denselben Slot und ist die Identität geschützt, gewinnt die Identität → `match-cut`. Sind die Slots getrennt und die Fähigkeit `verified`, ist `frame-chain` auch bei Lip-Sync möglich.

## 4. Reference Budget nach Relevanz

```
referenceScore = sceneRelevance × continuityImportance × identityImportance × providerCompatibility
```

Sortieren, auf das Modellmaximum kürzen. Eine Figur, die in dieser Szene nicht auftritt, fällt heraus — auch wenn sie global ein wichtiger Anker ist. Nicht 30 Bilder schicken, weil 30 gehen.

## 5. Transition Frame Analyzer (Phase 3)

„Last usable continuity frame" statt letztem Frame:

```
continuityFrameScore = visualQuality + subjectVisibility + compositionQuality
                     + motionCompatibility + semanticEndState
```

`semanticEndState` zählt mit: der Frame, in dem die Figur halb durch die Tür ist, kann der dramaturgisch richtige Einstieg für die Folgeszene sein, auch wenn ein früherer Frame technisch sauberer ist. Baut auf `extract-video-last-frame`, `extract-video-frames` und `analyze-scene-subject` auf.

## Releases

**Phase 1 — Capability Foundation.** Registry-Slot-Topologie für alle Modelle, Szenen-Bildrollen (`firstFrameUrl`, `endFrameUrl`, `characterReferences[]`, `locationReferences[]`, `productReferences[]`), Scene Classification, Resolver + Unit-Tests. **Keine Verhaltensänderung im Render.** `referenceImageUrl` und `lockReferenceUrl` bleiben unverändert bestehen und werden nur gespiegelt, nie ersetzt.

**Phase 2 — Silent / B-Roll Continuity.** Resolver scharf für `environment` und `product` ohne Lip-Sync: Frame-Chain und Endframe-Bridge, Provider-Adapter für die betroffenen Routen, UI „Visual Continuity" an der Schnittkante.

**Phase 3 — Character Intelligence.** Relevanz-Gewichtung, Multi-Ref-Budget, Lip-Sync-Kompatibilität über Slot-Konflikt + `verified`, Transition Frame Analyzer.

Die Lip-Sync-Kette (Feature-Freeze v400, Invariante: Geometrie ausschließlich auf `reference_image_url`) bleibt in Phase 1 und 2 vollständig unberührt. In Phase 3 wird sie nur dort angefasst, wo ein echter Provider-Lauf `verified: true` rechtfertigt — und nur nach grünem Referenzlauf mit vier Sprechern.

## UI

Ein Feld an der Schnittkante: **Visual Continuity — Auto · Seamless · Identity · Match Cut**, Default Auto. Der Tooltip nennt die Entscheidung im Klartext, z. B. „Hailuo — Charakter-Identität hat Vorrang → Match Cut" oder „Seedance 2.5 — Charakter + Vorframe + Location → nahtlos". Keine technischen Begriffe wie „First Frame Slot".

## Technische Details

- Neu: `src/lib/composer/visualInputs/{types.ts,classifyScene.ts,resolveVisualInputs.ts,referenceBudget.ts,slotArbitration.ts}` + Tests je Szenenklasse.
- `src/config/aiVideoModelRegistry.ts`: `visualInputs`-Block mit Slots je Modell, gefüllt aus `docs/ai-video-capability-matrix.md`; `maxReferences` bleibt als abgeleiteter Wert für bestehende UI.
- `src/types/video-composer.ts`: Rollen-Arrays und `visualContinuity?: 'auto' | 'seamless' | 'identity' | 'match-cut'` je Kante; Persistenz in `composer_scenes` abwärtskompatibel.
- Provider-Adapter je Familie: nimmt den `ResolvedVisualPlan` und mappt ihn auf den Provider-Body. `compose-video-clips` verliert seine Bildinput-Verzweigungen.
- Guard-Tests: (a) kein Resolver-Pfad schreibt `referenceImageUrl` / `lockReferenceUrl`; (b) ein geschützter Identitäts-Anker wird nie durch einen First Frame verdrängt; (c) `frame-chain` bei Lip-Sync nur bei getrennten Slots **und** `verified: true`; (d) Referenzanzahl je Payload ≤ Modellmaximum; (e) kein Provider-Adapter enthält Continuity-Entscheidungen.
- Preise, Wallet-Logik und Sync-Payload bleiben unverändert.

## Verifikation

Je ein echter Lauf mit protokolliertem Payload: (a) Atlantis / Environment auf Seedance 2.5 → Frame-Chain + Location-Referenz; (b) Landschaftspaar auf Hailuo → Frame-Chain; (c) Founder-Spot mit Lip-Sync → Identity-Priority, Anker unverändert, Match Cut; (d) Produkt-Hero auf Kling Omni → Produkt + Vorframe. Jeder Lauf, der eine `supported`-Fähigkeit bestätigt, setzt sie in der Registry auf `verified: true`.
