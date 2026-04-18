

## Zwei separate Bugs gefunden

### Bug 1 — WAV wird auf falsche Länge gepadded (Audio-Stotterer)

In `VoiceSubtitlesTab.tsx` Z. 228:
```ts
const { blob, exactSeconds } = await padAudioToExactWav(generatedUrl, realDur);
```

`realDur` ist die **VO-Länge** (z.B. 38s). Aber die **Komposition** ist `sumSceneSeconds + 0.15s pad` (z.B. 42s — siehe `compose-video-assemble` Z. 110-126).

Das WAV ist also nur 38s lang, nicht 42s. Wenn Lambda an Sekunde 38-42 Audio-Samples anfragt, gibt es nichts → Remotion-Audio-Mux füllt mit Stille, aber an **Chunk-Grenzen** (die jetzt dank szenen-aligned Chunking exakt an Szenen-Enden liegen, **inkl. der letzten Szenen-Grenze nahe VO-Ende**) entsteht ein Sample-Mismatch zwischen "WAV liefert keine Daten" und "nächster Chunk erwartet Stille". Deshalb stottert es **an manchen Übergängen** — genau an denen, die nahe oder hinter dem VO-Ende liegen.

**Fix**: Padding muss auf **Komposition-Länge** = `sceneTotalSeconds + 0.15s safety pad` rechnen, nicht auf `realDur`. Beim Berechnen brauchen wir `scenes` als Input zum VO-Generierungs-Handler, was schon der Fall ist (die Komponente hat `scenes` als prop).

```ts
const sceneTotal = scenes.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
const compositionDuration = Math.max(realDur, sceneTotal) + 0.15;
const { blob, exactSeconds } = await padAudioToExactWav(generatedUrl, compositionDuration);
```

Damit ist das WAV **mindestens so lang wie die Komposition** und hat saubere Stille bis zum Ende. Lambda findet an jeder Chunk-Grenze **echte Sample-Daten** (entweder VO-Audio oder explizite WAV-Stille — beides bit-deterministisch). Keine Mux-Heuristik mehr → keine Stotterer.

Zusätzlich: `durationSeconds` im DB-State setzen wir auf `realDur` (echte VO-Länge für Subtitle-Sync), aber das WAV ist länger gepadded — das ist die korrekte Trennung.

### Bug 2 — Tab-Position geht beim Verlassen verloren

In `VideoComposerDashboard.tsx` Z. 106:
```ts
const [activeTab, setActiveTab] = useState<TabId>('briefing');
```

`activeTab` wird **nicht** im `localStorage` Draft gespeichert. `loadDraft()` lädt nur `project`, nicht den Tab. Beim Re-Mount (z.B. nach Navigation zurück) startet man immer auf 'briefing'.

**Fix**: 
1. `activeTab` in einem separaten localStorage-Key persistieren (`video-composer-draft-tab`)
2. Beim Mount: aus localStorage lesen + nur dann setzen wenn der Tab "accessible" ist (z.B. nicht 'clips' wenn keine Szenen existieren — sonst sieht der User einen leeren Tab)

```ts
const TAB_STORAGE_KEY = 'video-composer-draft-tab';

const [activeTab, setActiveTab] = useState<TabId>(() => {
  const stored = localStorage.getItem(TAB_STORAGE_KEY) as TabId | null;
  const draft = loadDraft();
  if (!stored || !draft) return 'briefing';
  // Verify the stored tab is still accessible given the loaded project state
  const idx = ['briefing','storyboard','clips','text','audio','export'].indexOf(stored);
  if (idx === 0) return 'briefing';
  if (idx === 1 && !draft.briefing.productName) return 'briefing';
  if (idx >= 2 && (!draft.scenes || draft.scenes.length === 0)) return 'briefing';
  return stored;
});

useEffect(() => {
  localStorage.setItem(TAB_STORAGE_KEY, activeTab);
}, [activeTab]);
```

Bei `handleReset` zusätzlich `localStorage.removeItem(TAB_STORAGE_KEY)` aufrufen.

## Geänderte Dateien

- `src/components/video-composer/VoiceSubtitlesTab.tsx` — WAV-Padding auf `max(realDur, sceneTotal) + 0.15` statt `realDur`
- `src/components/video-composer/VideoComposerDashboard.tsx` — Tab-Persistenz in localStorage mit Accessibility-Check beim Restore

## Verify

1. VO neu generieren → Console: `WAV pad applied, exact duration X.XXXs` mit X ≥ Komposition-Länge (nicht VO-Länge)
2. Render → **alle** Übergänge sauber, auch die nahe am VO-Ende
3. Tab wechseln zu 'audio' → Browser zurück → wieder Composer öffnen → User landet wieder auf 'audio', nicht auf 'briefing'
4. Reset-Button → User landet auf 'briefing' (sauber zurückgesetzt)

