## Aktueller Stand (nach den letzten Turns)

**Fertig verdrahtet ✅**
- Pricing-Katalog, ClipSource-Types, Labels, Costs, Registry, Klingcredits-Config enthalten alle 5 Modelle: 2.5-Turbo (0,09 €/s, 10 s), 2.6 (0,12 €/s, 15 s), 3-Std (0,18 €/s, 10 s), 3-Pro (0,24 €/s, 15 s), Omni (0,60 €/s, 15 s).
- Backend `generate-kling-video`: model-driven Replicate-Slug pro Modell, Preis aus geteiltem Katalog, Duration-Limits aus Katalog, native Audio-Flag für 2.6 & Omni, Native-Lip-Sync-Feld für Omni sobald `dialogText` mitkommt.
- `providerCapabilities.ts` mit `nativeLipSync`/`nativeAudio`/`supportedLanguages`/`multiShot`/`maxSpeakers` — Omni ist als einziger `nativeLipSync=true` markiert.
- `lipsyncProviderSafety.ts`: `ai-kling-omni` gilt als safe → kein Ghost-Mouthing-Warndialog.

**Noch offen ⚠️ (Antwort auf deine Frage)**

1. **AI Video Studio UI ändert sich noch NICHT, wenn man Omni wählt.** Der `ToolkitGenerator` liest die neuen Capability-Felder nicht aus. Kein Dialog-Feld, kein Character-Picker, kein Voice-Preset, kein Language-Selector, kein "Native Lip-Sync"-Badge.
2. **Cast-&-World-Bindung an Omni fehlt.** Character → `start_image` + `dialogText` + Voice-Preset wird noch nicht aus dem Cast-Mention-System an das Edge-Function-Payload übergeben.
3. **Motion-Studio-Bypass fehlt.** Szenen mit `clipSource='ai-kling-omni'` durchlaufen aktuell immer noch den Sync.so-Zweig — die Umgehung greift nur, wenn das Payload `dialogText` mitschickt, was aktuell nirgends passiert.
4. **Replicate-Slugs sind ungeprüft.** `kwaivgi/kling-v3-standard`, `kwaivgi/kling-v3-pro`, `kwaivgi/kling-v2.5-turbo-pro`, `kwaivgi/kling-v2.6`, `kwaivgi/kling-v3-omni-video` — stammen aus dem Research-Report vom 12.07., wurden aber nicht live gegen Replicate verifiziert. Falls ein Slug so nicht existiert → 404 beim Generieren + Refund-Loop.
5. **Model-Selector-Sichtbarkeit ungeprüft.** Registry hat alle 5, aber ob der Dropdown im `ToolkitGenerator` sie wirklich alle anzeigt (Filter/Sort/Tier-Gating) ist nicht validiert.

## Zu Omni-Fähigkeiten (Recherchestand 12.07.)

- Native Lip-Sync in **EN/DE/ES** in einem Call. Kein separater Sync.so-Pass mehr nötig.
- **Max 2 Sprecher pro Clip.** Bei 3+ Sprechern muss weiter die klassische Hailuo + Sync.so-Pipeline greifen.
- Character-Anker: 1 Start-Image (der Charakter), optional End-Frame. Kein Multi-Reference wie Vidu.
- 5–15 s pro Clip, 1080p.
- Ambient-Audio + Lippenbewegung entstehen simultan — keine Post-Processing-Optionen für den Audio-Track.

## Vorschlag für die nächste Ausbauphase (Capability-driven UI)

**Phase A — AI Video Studio UI reagiert auf Modellwahl**
- `ToolkitGenerator.tsx` fragt bei jedem Modellwechsel die Capability-Matrix ab und rendert konditional:
  - Native Audio (2.6, Omni) → Language-Selector (DE/EN/ES) + Ambient-Only-Toggle.
  - Native Lip-Sync (nur Omni) → Dialog-Textarea + Voice-Preset-Dropdown + Character-Picker aus Cast & World (Hard-Cap 2 Sprecher).
  - Start-/End-Frame-Slot bei Modellen mit `startEndFrames`.
  - "Native Lip-Sync"-Badge + Kurzhinweis "Kein zweiter Render-Pass — spart Zeit & Credits".
- Wenn Omni + 3+ Sprecher gewählt → Warnhinweis "Omni unterstützt max. 2 Sprecher — bitte Modell wechseln oder Cast reduzieren".

**Phase B — Cast-&-World-Bindung**
- Character-Picker im Omni-Panel liest aus dem gleichen Store wie das Motion Studio (`useUnifiedMentionLibrary`).
- Auswahl setzt: `startImageUrl` = anchor image des Characters, `voicePreset` = Voice-Profile-Slug, `dialogText` = eingegebener Text.
- Speicherung des ausgewählten Cast-Sets in der Generation-Row für spätere Re-Renders.

**Phase C — Motion-Studio-Bypass**
- In `useTwoShotAutoTrigger` und `SceneDialogStudio`: wenn Scene `clipSource='ai-kling-omni'` UND Dialog vorhanden → direkt `generate-kling-video` mit `dialogText` aufrufen und den Sync.so-/Preclip-Zweig überspringen.
- `usePipelineProgress` behandelt Omni-Szenen als 1-Step-Rendering (kein separater Lip-Sync-Balken).

**Phase D — Slug- & Sichtbarkeits-Verifikation**
- Ein einmaliger Smoke-Test pro Kling-Modell (kurzer 5-s-Clip, Text-to-Video, minimaler Prompt) über Replicate, um zu bestätigen, dass alle fünf Slugs live existieren. Falls ein Slug fehlt → auf verifizierten Slug korrigieren, sonst deaktivieren.
- ModelSelector-Snapshot: sicherstellen, dass die 5 Modelle im Dropdown erscheinen (mit Sort-Reihenfolge: Turbo → 2.6 → 3-Std → 3-Pro → Omni).

## Empfehlung zur Reihenfolge

Für den 26.07.-Launch würde ich **Phase D zuerst** angehen (5 min Smoke-Test spart uns ggf. Refund-Cascades), dann **Phase A** (UI-Adaption), dann **Phase B** (Cast-Binding), zuletzt **Phase C** (Composer-Bypass). Phase C ist optional für den Launch — solange Omni im AI-Video-Studio funktioniert, kann Motion Studio zunächst weiter Hailuo+Sync.so nutzen.

## Rückfrage vor Umsetzung

Willst du die volle Phase A–D in einem Bundle oder erstmal nur Phase D (Slug-Verifikation) + Phase A (UI-Umbau im AI Video Studio) und dann entscheiden, ob Cast-Binding & Motion-Studio-Bypass noch vor dem Launch reinkommen?
