# Fix-Plan v242 — Outfit-Konflikt & Lip-Sync-Hard-Gate

Drei saubere, klar abgegrenzte Änderungen — keine unnötigen Nebenbaustellen.

---

## 1) Outfit-Dropdowns entwirren (ProductionPlanSheet)

**Problem**
- Label „Outfit lädt…" bleibt teils dauerhaft sichtbar, obwohl die Library längst geladen ist (Library-ID von der KI erfunden → kein Match → Fallback greift permanent).
- User kann gleichzeitig einen **Library-Outfit** und ein **Preset-Outfit** setzen → widersprüchlicher State.

**Lösung — ein einziges Outfit-Feld pro Slot**

Statt zwei nebeneinander liegender Selects rendern wir **ein** Select mit gruppierten Sektionen:

```text
[ Outfit für ANNA ▾ ]
 ├─ Standard-Look
 ├─ ── Meine Looks ──
 │   • Business Casual
 │   • Streetwear
 └─ ── Presets ──
     • Casual Denim
     • Formal Suit
     • …
```

- Auswahl aus **Meine Looks** setzt `outfitLookId`, löscht `outfitPreset`.
- Auswahl aus **Presets** setzt `outfitPreset`, löscht `outfitLookId`.
- „Standard-Look" löscht beides.
- Damit ist Mutual-Exclusivity strukturell erzwungen — keine Race-Conditions.

**Ladezustand**
- Der Fallback-Text „Outfit lädt…" wird ersetzt: Wenn eine `outfitLookId` referenziert wird, die (noch) nicht in der Library existiert, zeigen wir den Eintrag **gar nicht** an und fallen automatisch auf „Standard-Look" zurück. Kein Phantom-Eintrag mehr.

---

## 2) Lip-Sync-Toggle als echtes Hard-Gate

**Problem**
Auch mit `lipSyncWithVoiceover = false` startet die Sync.so-Pipeline, weil `SceneDialogStudio.handleGenerate` beim Klick auf „Generieren" unbedingt `engineOverride: 'cinematic-sync'`, `twoshotStage: 'audio'` und `lipSyncWithVoiceover: true` schreibt.

**Lösung — respektiere die User-Intention**

In `SceneDialogStudio.tsx` (Block ab Zeile ~1524) neu:

```ts
const wantsLipSync =
  scene.lipSyncWithVoiceover === true ||
  scene.dialogMode === true;

if (!wantsLipSync) {
  // No lip-sync path: erzeuge nur das Master-Video ohne Cinematic-Sync.
  // Skript bleibt als reine Regie-Notiz erhalten (keine TTS-Kopplung).
  onUpdate({
    clipStatus: 'generating',
    engineOverride: 'auto',
    twoshotStage: null,
  });
  await triggerPlainClipGeneration();   // == handleGenerateSingle-Äquivalent
  return;
}

// sonst: bestehende Cinematic-Sync-Pipeline
```

Zusätzlich in `SceneInlinePlayer.tsx` (Zeile 324): der Default-Subtitle
`"VO & Lip-Sync inklusive"` wird zu einer intent-abhängigen Variante:

```ts
sub = isLipSyncIntentional(scene) ? 'VO & Lip-Sync inklusive' : 'Nur Bild-Render';
```

**Ergebnis**
- Toggle AUS → weder Sync.so-Auftrag noch VO-Mux, kein Twoshot-Stage.
- Progress-Bar zeigt keine Lipsync-Phase (bereits gefixt in `usePipelineProgress.ts`).
- Toggle AN → Verhalten unverändert.

---

## 3) Regression-Guard

- Vitest-Case für `isLipSyncIntentional` bleibt Single-Source-of-Truth.
- Neuer Test: `SceneDialogStudio.handleGenerate` mit `lipSyncWithVoiceover=false` ruft **nicht** `compose-twoshot-audio` / `compose-dialog-segments` auf.

---

## Technische Details (kurz)

| Datei | Änderung |
|---|---|
| `src/components/video-composer/briefing/ProductionPlanSheet.tsx` | Zwei Outfit-Selects → ein gruppiertes Select; Fallback „Outfit lädt…" entfernt; `updateSceneCastOutfit` / `updateSceneCastPreset` löschen jeweils das andere Feld. |
| `src/components/video-composer/SceneDialogStudio.tsx` | `handleGenerate`: Early-Branch für „Lip-Sync AUS" → plain clip generation ohne cinematic-sync-Marker. |
| `src/components/video-composer/SceneInlinePlayer.tsx` | Default-Subtitle intent-abhängig. |
| `src/components/video-composer/__tests__/` | Neuer Test für Toggle-Off-Pfad. |

Keine DB-Migration, keine Edge-Function-Änderung, keine Kredit-Logik-Änderung.
