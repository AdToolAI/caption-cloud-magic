import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SCENE_STATES } from '@/lib/composer/sceneState';
import { sceneStatusPresentation } from '@/lib/composer/status/sceneStatusPresenter';

describe('v430 6.5 — sceneStatusPresentation', () => {
  it('liefert für jeden pipeline_state einen Key und Ton', () => {
    for (const state of SCENE_STATES) {
      const p = sceneStatusPresentation(state);
      expect(p.key).toMatch(/^scene\.status\./);
      expect(['idle', 'busy', 'ready', 'warning', 'error']).toContain(p.tone);
      expect(p.detailKey).toBeUndefined();
    }
  });

  it('ist pure — gleiche Eingabe, gleiches Ergebnis', () => {
    const a = sceneStatusPresentation('lipsync_running', 'syncso_pass_2');
    const b = sceneStatusPresentation('lipsync_running', 'syncso_pass_2');
    expect(a).toEqual(b);
  });

  it('projiziert dynamische Substates auf neutrale Keys mit Parametern', () => {
    expect(sceneStatusPresentation('lipsync_running', 'syncso_pass_3')).toMatchObject({
      detailKey: 'scene.status.detail.lipsync_pass',
      params: { n: 3 },
    });
    expect(sceneStatusPresentation('lipsync_running', 'syncso_retry_1').detailKey)
      .toBe('scene.status.detail.lipsync_retry');
    expect(sceneStatusPresentation('lipsync_running', 'syncso_fanout_2').detailKey)
      .toBe('scene.status.detail.lipsync_fanout');
  });

  it('gibt unbekannte Substates niemals roh als Detail aus', () => {
    const p = sceneStatusPresentation('plate_rendering', 'irgendwas_neues_v999');
    expect(p.detailKey).toBeUndefined();
    expect(p.rawSubstate).toBe('irgendwas_neues_v999');
  });

  it('hebt Warn-Substates im Ton hervor, überschreibt aber keinen Fehlerzustand', () => {
    expect(sceneStatusPresentation('plate_ready', 'awaiting_manual_face_map').tone).toBe('warning');
    expect(sceneStatusPresentation('failed', 'awaiting_manual_face_map').tone).toBe('error');
    expect(sceneStatusPresentation('failed').tone).toBe('error');
  });

  it('bleibt locale-unabhängig (kein tx/getLang/localStorage im Modul)', () => {
    const src = readFileSync('src/lib/composer/status/sceneStatusPresenter.ts', 'utf8');
    expect(src).not.toMatch(/i18nText|getLang|localStorage|\btx\(/);
    expect(src).not.toMatch(/^import \{[^}]*\} from '@\/lib\/composer\/sceneState'/m);
  });
});
