// Hard limits for what an AI video model can actually deliver in N seconds.
// These bound how complex a single scene can be — the Scene Director enforces
// these in its system prompt and the UI surfaces them so the user sees what's
// realistic before generating.

export interface SceneBudget {
  durationSeconds: number;
  maxActions: number;
  maxCameraMoves: number;
  maxScriptWords: number; // ~2.3 words per second of speech
  maxAssets: number;
}

const TABLE: ReadonlyArray<{ upTo: number; b: Omit<SceneBudget, 'durationSeconds'> }> = [
  { upTo: 4,  b: { maxActions: 1, maxCameraMoves: 1, maxScriptWords: 9,  maxAssets: 2 } },
  { upTo: 6,  b: { maxActions: 2, maxCameraMoves: 1, maxScriptWords: 14, maxAssets: 3 } },
  { upTo: 9,  b: { maxActions: 2, maxCameraMoves: 2, maxScriptWords: 20, maxAssets: 4 } },
  { upTo: 12, b: { maxActions: 3, maxCameraMoves: 2, maxScriptWords: 28, maxAssets: 5 } },
  { upTo: 15, b: { maxActions: 3, maxCameraMoves: 3, maxScriptWords: 35, maxAssets: 6 } },
];

export function getSceneBudget(durationSeconds: number): SceneBudget {
  const d = Math.max(3, Math.min(15, Math.round(durationSeconds || 5)));
  const row = TABLE.find((r) => d <= r.upTo) ?? TABLE[TABLE.length - 1];
  return { durationSeconds: d, ...row.b };
}

export function summarizeBudget(b: SceneBudget, lang: 'en' | 'de' | 'es' = 'en'): string {
  if (lang === 'de') {
    return `${b.durationSeconds}s · max ${b.maxActions} Aktion${b.maxActions === 1 ? '' : 'en'} · ~${b.maxScriptWords} Wörter Skript · ${b.maxAssets} Assets`;
  }
  if (lang === 'es') {
    return `${b.durationSeconds}s · máx ${b.maxActions} acción${b.maxActions === 1 ? '' : 'es'} · ~${b.maxScriptWords} palabras · ${b.maxAssets} assets`;
  }
  return `${b.durationSeconds}s · max ${b.maxActions} action${b.maxActions === 1 ? '' : 's'} · ~${b.maxScriptWords} words · ${b.maxAssets} assets`;
}
