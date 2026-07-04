## Ziel

Kling, Wan, Seedance und Luma neben Hailuo/HappyHorse als vollwertige Master-Plate-Provider für die Sync.so Lip-Sync-Pipeline freischalten. Gleichzeitig den bestehenden Bug fixen, dass "Clip mit Lip-Sync generieren" auf Single-Speaker-Szenen still nur einen Voiceover-Block anhängt.

Ergebnis nach dem Fix: Kling-Szene → „Lip-Sync generieren" klicken → Kling rendert die Master-Plate → Sync.so legt Lip-Sync sauber drauf. Kein stiller Provider-Swap mehr, keine Toast-Sackgasse.

## Warum das mit den bestehenden Modellen funktioniert

Sync.so operiert auf einem fertigen Video (`clip_url` + Audio). Die Pipeline in `compose-dialog-segments` ist bereits provider-agnostisch — sie liest die generierte Plate und liefert sie an Sync.so `lipsync-3`. Der einzige provider-spezifische Baustein pro Renderer ist:

- **Duration-Regeln** (Kling 3–15 s, Wan 3–10 s, Seedance 3–12 s, Luma 5/9 s, HappyHorse 3–15 s, Hailuo 6/10 s) — schon per Provider in `compose-video-clips` implementiert.
- **Lead-in-Trim** (`computeLeadInTrim`) — bereits pro Provider gepflegt.

Es gibt daher keinen Grund, warum Sync.so nur auf HappyHorse/Hailuo laufen sollte. Die Allowlist ist eine Altlast vom 26. Juni 2026.

## Umfang

### 1. Backend — Allowlist auf 6 Provider erweitern

`supabase/functions/compose-video-clips/index.ts`

- **Zeile ~1308–1330** (`invalid_provider_for_lipsync`-Guard): Allowlist von `["ai-happyhorse", "ai-hailuo"]` auf
  ```ts
  const LIPSYNC_PROVIDERS = new Set([
    "ai-happyhorse", "ai-hailuo",
    "ai-kling", "ai-wan", "ai-seedance", "ai-luma",
  ]);
  ```
  Neuer Fehlertext + `allowed`-Array beim 400-Response entsprechend.
- **Zeile ~1332–1364** (duration guard): Analoge `invalid_duration_for_provider`-Checks pro neuem Provider ergänzen:
  - Kling: `3 ≤ d ≤ 15`
  - Wan: `3 ≤ d ≤ 10`
  - Seedance: `3 ≤ d ≤ 12`
  - Luma: `d === 5 || d === 9`
- **Zeile ~1297–1306** (HH-Guard-Log): sprachlich generalisieren, damit Log für alle Provider konsistent bleibt („Scene X: {provider} + {engine} — keeping as master plate").
- **`SUPPORTED_AI_SOURCES`**-Fallback (Zeile ~1367–1384) bleibt unverändert; die neuen Provider sind bereits Teil dieser Menge.

Kein Änderungsbedarf in `compose-dialog-segments/index.ts` — die Datei liest die Master-Plate agnostisch als Video-URL.

### 2. Frontend — Master-Provider-Whitelist + Single-Speaker-Intent

`src/components/video-composer/SceneDialogStudio.tsx`

- **Zeile ~1101–1110** — `forceCinematicSync` erweitern, damit der Button-Klick selbst als Opt-in zählt (aktuell führt der Klick auf Single-Speaker-Szenen still zu `handleGenerateInline`):

  ```ts
  const buttonIntendsLipSync =
    (blocks.length === 1 && renderAsSeparateScenes) ||
    (blocks.length >= 2 && allHavePortraits && !renderAsSeparateScenes);

  const forceCinematicSync =
    blocks.length === 1 &&
    allHavePortraits &&
    (
      (scene as any).engineOverride === 'cinematic-sync' ||
      (scene as any).lipSyncWithVoiceover === true ||
      buttonIntendsLipSync
    );
  ```

- **Zeile ~1373–1385** — `masterProvider` respektiert jetzt die User-Wahl:

  ```ts
  const LIPSYNC_PROVIDERS = new Set([
    'ai-hailuo', 'ai-happyhorse', 'ai-kling', 'ai-wan', 'ai-seedance', 'ai-luma',
  ] as const);
  type LipsyncProvider = typeof LIPSYNC_PROVIDERS extends Set<infer T> ? T : never;

  const userPickedProvider = (scene.clipSource as string) || 'ai-happyhorse';
  const masterProvider: LipsyncProvider = LIPSYNC_PROVIDERS.has(userPickedProvider as any)
    ? (userPickedProvider as LipsyncProvider)
    : 'ai-happyhorse';
  ```

- **`masterDuration`** — provider-aware statt hart `hailuo | happyhorse`:

  ```ts
  const clamp = (min: number, max: number) => Math.min(max, Math.max(min, Math.ceil(userPick)));
  const masterDuration =
    masterProvider === 'ai-hailuo'      ? (userPick === 10 ? 10 : 6)
    : masterProvider === 'ai-happyhorse' ? clamp(3, 15)
    : masterProvider === 'ai-kling'      ? clamp(3, 15)
    : masterProvider === 'ai-wan'        ? clamp(3, 10)
    : masterProvider === 'ai-seedance'   ? clamp(3, 12)
    : /* ai-luma */                        (userPick >= 8 ? 9 : 5);
  ```

- Die vorhandene „Dialog länger als Szene"-Warnung analog auf `audioRequired > masterDuration` mit jedem Provider triggern (bereits generisch formuliert — nur Providername im Toast einsetzen).

### 3. UI — Provider-Picker signalisiert Lip-Sync-Fähigkeit

`src/components/video-composer/SceneCard.tsx` (bzw. dort, wo der Clip-Source-Picker sitzt): Am Sync/Lip-Sync-Toggle keine Provider-spezifische Sperre mehr — der bisherige Hinweis „nur HappyHorse/Hailuo" wird durch die neue Liste (Hailuo, HappyHorse, Kling, Wan, Seedance, Luma) ersetzt. Provider außerhalb dieser Liste (Runway/Vidu/Pika/Veo/Sora/Grok) bekommen weiterhin einen Disabled-Zustand mit klarem Tooltip („Lip-Sync via Sync.so aktuell nicht auf {provider} zertifiziert").

Kein Redesign, nur Text/Disabled-Logik anpassen. Die genaue Datei-Position wird im Build-Modus mit `rg` gesucht (Prompt-Text der bestehenden Warnung).

### 4. Verifikation

- **Kling-Szene, 1 Sprecher, „Erweitert"-Toggle an → „Clip mit Lip-Sync generieren":**
  - Toast „Dialog-Shots werden gerendert" (nicht mehr „1 Voiceover-Block angehängt").
  - `compose-video-clips` wird mit `clipSource: 'ai-kling'` + `engineOverride: 'cinematic-sync'` aufgerufen, gibt 2xx zurück.
  - Kling rendert die Plate → Sync.so-Dispatch läuft → finaler Clip mit Lip-Sync.
- **Wan / Seedance / Luma:** gleiche Verifikation mit provider-typischen Dauern (Wan 8 s, Seedance 10 s, Luma 5 s).
- **Hailuo/HappyHorse:** unverändertes Verhalten (Regressionscheck).
- **Provider außerhalb Allowlist (Runway/Vidu/Pika/…):** Backend antwortet weiterhin mit sauberem 400 `invalid_provider_for_lipsync`; UI hat ihn schon disabled.
- **Bestehender Unit-Test** `src/lib/video-composer/__tests__/lipSyncIntent.test.ts` bleibt grün — er testet `isLipSyncIntentional()`, das nicht angefasst wird.

## Was NICHT Teil dieser Änderung ist

- Keine neuen Sync.so-Modi/Retry-Strategien — nur Provider-Freigabe.
- Keine neuen Master-Plate-Provider (Vidu/Runway/Pika/Veo/Sora/Grok) — bleiben ausdrücklich außen vor.
- Keine Änderung an `compose-dialog-segments`, `poll-dialog-shots`, `sync-so-webhook` — die sind provider-agnostisch.
- Keine Änderung an Preisen/Margen — die per-Provider-Kalkulation in `videoProviderMargins.ts` gilt bereits.

## Betroffene Dateien

- `supabase/functions/compose-video-clips/index.ts` (Allowlist + Duration-Guards)
- `src/components/video-composer/SceneDialogStudio.tsx` (Single-Speaker-Intent + masterProvider-Whitelist + masterDuration)
- `src/components/video-composer/SceneCard.tsx` (nur Text/Disabled-Logik des Lip-Sync-Toggles, ~10 Zeilen)

## Rollback

Falls Kling/Wan/Seedance/Luma in Sync.so unerwartet häufig `provider_unknown_error` liefern (unwahrscheinlich, weil Sync.so blind auf dem MP4 arbeitet), reicht ein einzeiliger Revert des `LIPSYNC_PROVIDERS`-Sets in `compose-video-clips`. Die Frontend-Änderungen bleiben in dem Fall weiter valide.
