import { describe, it, expect } from 'vitest';
import { upgradeOverlay, clampBox, isGraphicOverlay, DEFAULT_OVERLAY_BOX } from '@/lib/directors-cut/overlayModel';
import { OVERLAY_PRESETS, instantiatePreset, applyBrandToOverlays } from '@/lib/directors-cut/overlayPresets';
import type { TextOverlay } from '@/types/directors-cut';

const legacy: TextOverlay = {
  id: 'a',
  text: 'Hallo',
  animation: 'fadeIn',
  position: 'bottom',
  startTime: 1,
  endTime: 4,
  style: { fontSize: 'lg', color: '#fff', backgroundColor: 'transparent', shadow: true, fontFamily: 'Inter' },
};

describe('overlayModel', () => {
  it('migriert Alt-Overlays verlustfrei auf das Box-Modell', () => {
    const up = upgradeOverlay(legacy);
    expect(up.kind).toBe('text');
    expect(up.box).toBeDefined();
    expect(up.box!.x).toBeGreaterThanOrEqual(0);
    expect(up.box!.y + up.box!.h).toBeLessThanOrEqual(1);
    expect(up.text).toBe('Hallo');
    expect(up.startTime).toBe(1);
    expect(up.style.fontSizeRel).toBeCloseTo(48 / 1080, 5);
  });

  it('hält Boxen im sichtbaren Bereich', () => {
    expect(clampBox({ x: -0.5, y: 1.4, w: 2, h: 0.2 })).toEqual({ x: 0, y: 0.8, w: 1, h: 0.2 });
  });

  it('erkennt Grafik-Overlays', () => {
    expect(isGraphicOverlay(legacy)).toBe(false);
    expect(isGraphicOverlay({ ...legacy, kind: 'banner' })).toBe(true);
  });
});

describe('overlayPresets', () => {
  it('liefert für jeden Baustein eine gültige Box', () => {
    for (const preset of OVERLAY_PRESETS) {
      const o = instantiatePreset(preset, 0, 5);
      expect(o.kind).toBe(preset.kind);
      expect(o.box ?? DEFAULT_OVERLAY_BOX[preset.kind]).toBeDefined();
      const box = o.box!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(1.0001);
      expect(box.y + box.h).toBeLessThanOrEqual(1.0001);
      expect(o.style.fontSizeRel).toBeGreaterThan(0);
    }
  });

  it('vergibt eindeutige IDs', () => {
    const ids = new Set(OVERLAY_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(OVERLAY_PRESETS.length);
  });

  it('setzt Markenfarben auf Störer und CTA als Fläche', () => {
    const cta = instantiatePreset(OVERLAY_PRESETS.find((p) => p.kind === 'cta')!, 0, 5);
    const [branded] = applyBrandToOverlays([cta], { primary_color: '#123456' });
    expect(branded.style.fill).toBe('#123456');
    expect(branded.style.accentColor).toBe('#123456');
  });
});
