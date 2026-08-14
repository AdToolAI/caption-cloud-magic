/**
 * v430 Schritt 6.4 — Verhaltens- und Paritätstests der SceneCard-Presentation.
 *
 * Jeder Test hält die ALTE Ausdrucks-Semantik gegen die neue Resolver-Semantik,
 * damit die Umstellung nachweislich keine Darstellung verändert.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sceneAnyOutputUrl,
  sceneDirectorModeReady,
  sceneHasAuthoredContent,
  sceneLipsyncFlags,
  sceneRenderedOutputUrl,
  sceneStockThumbnail,
  sceneThumbnailSource,
  type ScenePresentationInput,
} from '../sceneCardPresentation';

const legacyScene: ScenePresentationInput = { clipUrl: 'https://cdn/legacy.mp4' };
const lipsyncScene: ScenePresentationInput = {
  baseVideoUrl: 'https://cdn/base.mp4',
  processedVideoUrl: 'https://cdn/muxed.mp4',
  clipUrl: 'https://cdn/muxed.mp4',
  lipSyncStatus: 'applied',
};
const failedWithOutput: ScenePresentationInput = {
  baseVideoUrl: 'https://cdn/base.mp4',
  clipUrl: 'https://cdn/base.mp4',
};
const uploadOnly: ScenePresentationInput = { uploadUrl: 'https://cdn/user.mp4' };
const emptyScene: ScenePresentationInput = {};

describe('sceneRenderedOutputUrl / sceneAnyOutputUrl', () => {
  it('legacy clip_url bleibt der gerenderte Output', () => {
    expect(sceneRenderedOutputUrl(legacyScene)).toBe('https://cdn/legacy.mp4');
  });

  it('lip-sync Szene zeigt den gemuxten Output, nicht die Basis', () => {
    expect(sceneRenderedOutputUrl(lipsyncScene)).toBe('https://cdn/muxed.mp4');
  });

  it('failed + vorhandener Output zeigt weiterhin den Basis-Clip', () => {
    expect(sceneRenderedOutputUrl(failedWithOutput)).toBe('https://cdn/base.mp4');
  });

  it('Upload zählt NICHT als gerenderter Output (alte clipUrl-Semantik)', () => {
    expect(sceneRenderedOutputUrl(uploadOnly)).toBeNull();
    expect(sceneAnyOutputUrl(uploadOnly)).toBe('https://cdn/user.mp4');
  });

  it('leere Szene liefert null', () => {
    expect(sceneRenderedOutputUrl(emptyScene)).toBeNull();
    expect(sceneAnyOutputUrl(emptyScene)).toBeNull();
  });
});

describe('sceneHasAuthoredContent (Expanded-Default)', () => {
  const legacyExpression = (s: any) =>
    Boolean((s.aiPrompt ?? '').trim()) ||
    Boolean((s.dialogScript ?? '').trim()) ||
    Boolean(s.clipUrl) ||
    Boolean(s.uploadUrl);

  const cases: ScenePresentationInput[] = [
    emptyScene,
    { aiPrompt: '  ' },
    { aiPrompt: 'Ein Shot' },
    { dialogScript: 'A: Hallo' },
    legacyScene,
    uploadOnly,
    lipsyncScene,
    failedWithOutput,
  ];

  it('ist paritätisch zur alten Ableitung', () => {
    for (const c of cases) {
      expect(sceneHasAuthoredContent(c)).toBe(legacyExpression(c));
    }
  });
});

describe('sceneDirectorModeReady', () => {
  it('nur sichtbar bei ready UND gerendertem Output', () => {
    expect(sceneDirectorModeReady(legacyScene, true)).toBe(true);
    expect(sceneDirectorModeReady(legacyScene, false)).toBe(false);
    expect(sceneDirectorModeReady(uploadOnly, true)).toBe(false);
    expect(sceneDirectorModeReady(emptyScene, true)).toBe(false);
    expect(sceneDirectorModeReady(lipsyncScene, true)).toBe(true);
  });
});

describe('sceneThumbnailSource', () => {
  it('Bild-Szenen liefern kind=image inklusive Upload-Fallback', () => {
    expect(sceneThumbnailSource({ ...legacyScene, clipSource: 'ai-image' })).toEqual({
      kind: 'image',
      url: 'https://cdn/legacy.mp4',
    });
    expect(sceneThumbnailSource({ ...uploadOnly, uploadType: 'image' })).toEqual({
      kind: 'image',
      url: 'https://cdn/user.mp4',
    });
    expect(sceneThumbnailSource({ clipSource: 'stock-image' })).toEqual({
      kind: 'none',
      url: null,
    });
  });

  it('Video-Szenen bevorzugen den gerenderten Output vor dem Upload', () => {
    expect(sceneThumbnailSource({ ...legacyScene, uploadUrl: 'https://cdn/user.mp4' })).toEqual({
      kind: 'video',
      url: 'https://cdn/legacy.mp4',
    });
    expect(sceneThumbnailSource(uploadOnly)).toEqual({
      kind: 'video',
      url: 'https://cdn/user.mp4',
    });
    expect(sceneThumbnailSource(lipsyncScene)).toEqual({
      kind: 'video',
      url: 'https://cdn/muxed.mp4',
    });
  });

  it('ohne jede Quelle bleibt das Platzhalter-Icon', () => {
    expect(sceneThumbnailSource(emptyScene)).toEqual({ kind: 'none', url: null });
  });
});

describe('sceneStockThumbnail', () => {
  it('Provider-Thumb schlägt den Output', () => {
    expect(sceneStockThumbnail({ ...legacyScene, stockMediaThumb: 'https://cdn/thumb.jpg' })).toBe(
      'https://cdn/thumb.jpg',
    );
    expect(sceneStockThumbnail(legacyScene)).toBe('https://cdn/legacy.mp4');
    expect(sceneStockThumbnail(uploadOnly)).toBeNull();
  });
});

describe('sceneLipsyncFlags', () => {
  it('normale Szene ohne Substate hat keine Artefakte', () => {
    expect(sceneLipsyncFlags('idle', null, false)).toEqual({
      busy: false,
      hasArtifact: false,
      cancellable: false,
    });
  });

  it('laufender Lip-Sync ist busy und abbrechbar', () => {
    for (const st of ['lipsync_dispatched', 'lipsync_running', 'lipsync_muxing'] as const) {
      expect(sceneLipsyncFlags(st, null, false)).toEqual({
        busy: true,
        hasArtifact: true,
        cancellable: true,
      });
    }
  });

  it('Audio-Phasen sind Artefakt und abbrechbar, aber nicht busy', () => {
    expect(sceneLipsyncFlags('audio_prep', null, false)).toEqual({
      busy: false,
      hasArtifact: true,
      cancellable: true,
    });
    expect(sceneLipsyncFlags('audio_ready', null, false)).toEqual({
      busy: false,
      hasArtifact: true,
      cancellable: true,
    });
  });

  it('complete ist Artefakt, aber nicht mehr abbrechbar', () => {
    expect(sceneLipsyncFlags('complete', null, false)).toEqual({
      busy: false,
      hasArtifact: true,
      cancellable: false,
    });
  });

  it('failed mit Substate bleibt abbrechbar', () => {
    expect(sceneLipsyncFlags('failed', 'lipsync_1', true)).toEqual({
      busy: false,
      hasArtifact: true,
      cancellable: true,
    });
    expect(sceneLipsyncFlags('failed', null, true)).toEqual({
      busy: false,
      hasArtifact: false,
      cancellable: false,
    });
  });
});

describe('Reinheit des Helpers', () => {
  it('importiert weder React noch Supabase und schreibt nichts', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/composer/sceneCardPresentation.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/from ['"]react['"]/);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/\.update\(|\.insert\(/);
  });
});

describe('SceneCard liest Output nur über die Verträge', () => {
  it('enthält keine direkten clipUrl/uploadUrl-Reads mehr', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/video-composer/SceneCard.tsx'),
      'utf8',
    );
    // Erlaubt bleiben Writes (`clipUrl: …`) und die Upload-Widget-Props
    // (`uploadUrl={scene.uploadUrl}`), die das Rohfeld bewusst durchreichen.
    const forbidden = src
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /scene\.clipUrl/.test(line))
      .filter(([, line]) => !/clipUrl:\s/.test(line));
    expect(forbidden.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
  });
});
