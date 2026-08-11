# Visual-Continuity-System für Motion Studio

Einzige gültige Spezifikation. Vorherige Fassungen sind ersetzt.

Alle vier Punkte übernommen: doppelte Fassungen entfernt, `verified` nur über kontrollierte Capability-Tests, Lip-Sync als Requirement statt als Szenenklasse, eine einzige harte Invariante.

## Kerninvariante

```text
Continuity darf niemals einen geschützten Identity- oder Sync-Anchor verdrängen.
```

Alles andere folgt daraus. Es gibt keine Regel „Lip-Sync = immer Match-Cut" — Match-Cut ist das Ergebnis eines Slot-Konflikts bei geschütztem Anker. Der Satz steht als Kommentar über dem Resolver, und die Guard-Tests prüfen genau ihn.

## Zielarchitektur

```text
STORYBOARD
   ↓ Scene Requirement Analysis
   ↓ Scene Classification + Requirements
   ↓ Character / Product / Location Anchors
   ↓ Model Capability Profile
   ↓ ┌────────────────────────┐
     │ VisualInputResolver    │  einzige Entscheidungsinstanz
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

Es gibt keinen separaten Transition Resolver und keinen separaten Lip-Sync-Guard hinter dem Resolver. Beides liegt im Resolver.

## Szenenklasse + Requirements

```ts
type VisualSceneClass = 'environment' | 'product' | 'character';

interface SceneVisualRequirements {
  lipSync: boolean;
  identityCritical: boolean;
  productCritical: boolean;
  locationContinuity: 'none' | 'medium' | 'high';
}
```

Lip-Sync ist bewusst **keine** Klasse — sonst entstehen später `lipsync-product-character` und ähnliche Kombinationsklassen.

Priorität bei knappem Slot ergibt sich aus Klasse + Requirements:
- `environment` → Übergang vor Location
- `product` mit `productCritical` → Produkt vor Übergang, sonst Übergang
- `character` mit `identityCritical` → Identität vor Übergang
- zusätzlich `lipSync: true` → Sync-/Identitäts-Anker ist geschützt und gewinnt jeden Slot-Konflikt

## Registry: Slot-Topologie

```ts
visualInputs: {
  firstFrame: { supported: true, slot: 'first-frame' },
  endFrame:   { supported: false },
  references: { max: 30, slot: 'references', character: true, product: true, location: true },
  lipSync: {
    supported: true,
    requiresIdentityReference: true,
    conflictsWithFirstFrame: false,
    verification: { status: 'unverified' },   // 'unverified' | 'verified' | 'failed'
  },
}
```

Konkurrierender Provider:

```ts
firstFrame: { supported: true, slot: 'image-input' },
references: { max: 1, slot: 'image-input' },
```

Gleicher Slot = Konflikt, verschiedener Slot = koexistiert. Weitere Slots (`character_ref`, `subject_ref`, `style_ref`, `start_image`, `end_image`, `video_ref`) lassen sich ohne konzeptionellen Umbau ergänzen. `maxReferences` bleibt als abgeleiteter Wert für bestehende UI erhalten.

### Verification wird nie durch Produktions-Traffic gesetzt

```ts
verification: { status: 'unverified' | 'verified' | 'failed', testedAt?: string, testCase?: string }
```

`supported` heißt „laut Provider-Doku". `verified` setzt ausschließlich ein gezielter Capability-Test über eine Admin-Route (fester Testfall, protokollierter Payload und Provider-Antwort) — nie ein normaler Kundenrender. Auto nutzt nur `verified`-Fähigkeiten; `supported && unverified` erscheint als manuell wählbare Option mit Hinweis. `failed` sperrt die Option.

## ResolvedVisualPlan

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

Slot-Arbitrierung: gleicher Slot + geschützte Identität → Identität gewinnt, `match-cut`. Getrennte Slots + `verification.status === 'verified'` → `frame-chain` möglich, auch bei Lip-Sync.

## Reference Budget nach Relevanz

```
referenceScore = sceneRelevance × continuityImportance × identityImportance × providerCompatibility
```

Sortieren, auf das Modellmaximum kürzen. Eine Figur, die in dieser Szene nicht auftritt, fällt heraus — auch wenn sie global ein wichtiger Anker ist.

## Transition Frame Analyzer (Phase 3)

„Last usable continuity frame" statt letztem Frame:

```
continuityFrameScore = visualQuality + subjectVisibility + compositionQuality
                     + motionCompatibility + semanticEndState
```

`semanticEndState` zählt mit: der Frame, in dem die Figur halb durch die Tür ist, kann der dramaturgisch richtige Einstieg für die Folgeszene sein, auch wenn ein früherer Frame technisch sauberer ist. Baut auf `extract-video-last-frame`, `extract-video-frames` und `analyze-scene-subject` auf.

## Releases

**Phase 1 — Capability Foundation.** Slot-Topologie für alle Modelle, Szenen-Bildrollen, Classification + Requirements, Resolver, Unit-Tests. Keine Verhaltensänderung im Render.

**Phase 2 — Environment / Product Continuity.** Resolver scharf für Szenen ohne Lip-Sync: Frame-Chain und Endframe-Bridge, Provider-Adapter der betroffenen Routen, UI an der Schnittkante.

**Phase 3 — Character Intelligence.** Relevanz-Gewichtung, Multi-Ref-Budget, Lip-Sync über Slot-Konflikt + `verified`, Transition Frame Analyzer.

Die Lip-Sync-Kette (Feature-Freeze v400, Geometrie ausschließlich auf `reference_image_url`) bleibt in Phase 1 und 2 unberührt und wird in Phase 3 nur nach grünem Referenzlauf mit vier Sprechern angefasst.

## Risiko für die Lip-Sync-Pipeline

Ehrliche Antwort: **In Phase 1 nein, in Phase 2 nur an genau einer Stelle, in Phase 3 bewusst und kontrolliert.**

Die eine reale Gefahrenstelle: `supabase/functions/compose-video-clips/index.ts` steht auf der Freeze-Liste (`.lovable/LIPSYNC-FEATURE-FREEZE.md`) — und genau diese Datei soll in Phase 2 den Provider-Adapter bekommen. Deshalb gelten dort harte Randbedingungen:

1. Der Resolver wird in `compose-video-clips` nur für Szenen aufgerufen, für die `isLipSyncIntentional()` (aus `src/lib/video-composer/lipSyncIntent.ts`, die Single Source of Truth) **false** liefert. Für alle anderen Szenen läuft der bestehende Code Zeile für Zeile unverändert weiter.
2. Nicht angefasst werden: die Provider-Migrationen (HappyHorse/Pika → Hailuo), `LIPSYNC_PROVIDERS`-Prüfung, `beginSceneRun()`, Plate-Dispatch, `compose-dialog-segments`, `sync-so-webhook`, `pass-face-preclip`, `DialogStitchVideo`, `lipsyncProviderSafety.ts`.
3. `src/lib/composer/__tests__/lipsyncFrozenContract.test.ts` und der Deno-Contract-Test bleiben grün — sie prüfen unter anderem, dass `compose-video-clips` weiterhin `beginSceneRun` aufruft. Ein Bruch fällt in CI auf, nicht beim Kunden.
4. Neue Szenenfelder sind additiv; `reference_image_url` und `lock_reference_url` behalten Bedeutung und Schreibpfade. Die v400-Invariante „Geometrie wird auf `reference_image_url` gemessen" bleibt wortgleich gültig.

Was bleibt an Restrisiko: Phase 2 ändert die Datei, in der auch die Lip-Sync-Verzweigung liegt — ein Flüchtigkeitsfehler beim Umbau träfe theoretisch beide Pfade. Absicherung: der Umbau erfolgt als eigener, kleiner Diff (nur der Nicht-Lip-Sync-Zweig), mit einem Vorher/Nachher-Referenzlauf einer Vier-Sprecher-Szene und Eintrag im Golden-Run-Log.

Formal bedeutet Phase 3 ein Teil-Unfreeze („unfreeze lipsync" mit Scope „First-Frame-Slot bei verifizierten Providern"). Ohne diese ausdrückliche Freigabe wird Phase 3 nicht gestartet — Phase 1 und 2 liefern eigenständig Nutzen.


## UI

Ein Feld an der Schnittkante: **Visual Continuity — Auto · Seamless · Identity · Match Cut**, Default Auto. Tooltip nennt die Entscheidung im Klartext („Hailuo — Charakter-Identität hat Vorrang → Match Cut", „Seedance 2.5 — Charakter + Vorframe + Location → nahtlos"). Keine technischen Begriffe wie „First Frame Slot". Gesperrte Optionen zeigen ihre Begründung.

## Technische Details

- Neu: `src/lib/composer/visualInputs/` mit `types.ts`, `classifyScene.ts`, `slotArbitration.ts`, `referenceBudget.ts`, `resolveVisualInputs.ts` und Tests je Klasse × Requirements-Kombination.
- `src/config/aiVideoModelRegistry.ts`: `visualInputs`-Block je Modell, gefüllt aus `docs/ai-video-capability-matrix.md`.
- `src/types/video-composer.ts`: `firstFrameUrl`, `endFrameUrl`, `characterReferences[]`, `locationReferences[]`, `productReferences[]`, `sceneClass`, `requirements`, `visualContinuity?: 'auto' | 'seamless' | 'identity' | 'match-cut'`. `referenceImageUrl` und `lockReferenceUrl` bleiben unverändert und werden nur gespiegelt, nie ersetzt. Persistenz in `composer_scenes` abwärtskompatibel.
- Provider-Adapter je Familie: mappt `ResolvedVisualPlan` → Provider-Body. `compose-video-clips` und die `generate-*-video`-Functions verlieren ihre eigenen Bildinput-Entscheidungen.
- Admin-Capability-Test-Route, die `verification` setzt; kein Schreibpfad aus dem normalen Render.
- Guard-Tests: (a) die Kerninvariante — ein geschützter Anker wird nie durch einen First Frame verdrängt; (b) kein Resolver-Pfad schreibt `referenceImageUrl` / `lockReferenceUrl`; (c) `frame-chain` bei Lip-Sync nur bei getrennten Slots und `verified`; (d) Referenzanzahl ≤ Modellmaximum; (e) kein Provider-Adapter enthält Continuity-Logik; (f) kein Render-Pfad schreibt `verification`.
- Preise, Wallet-Logik und Sync-Payload bleiben unverändert.

## Verifikation

Kontrollierte Capability-Tests (Admin, fester Testfall, protokollierter Payload): (a) Environment auf Seedance 2.5 → Frame-Chain + Location-Referenz; (b) Landschaftspaar auf Hailuo → Frame-Chain; (c) Founder-Spot mit Lip-Sync → Identity-Priority, Anker unverändert, Match Cut; (d) Produkt-Hero auf Kling Omni → Produkt + Vorframe. Nur diese Läufe setzen `verification.status`.
