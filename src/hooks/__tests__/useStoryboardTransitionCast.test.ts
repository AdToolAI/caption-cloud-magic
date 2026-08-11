import { describe, expect, it } from 'vitest';
import { buildBriefingText } from '@/hooks/useStoryboardTransition';
import type { ComposerBriefing } from '@/types/video-composer';

const IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
];

describe('useStoryboardTransition — Cast & World briefing contract', () => {
  it('sends current character.id UUIDs in their selected order', () => {
    const briefing: ComposerBriefing = {
      mode: 'ai',
      productName: 'Continuity Stress Test',
      productDescription: 'Create two scenes with four speakers.',
      usps: [],
      targetAudience: 'Creators',
      tone: 'professional',
      duration: 60,
      aspectRatio: '9:16',
      brandColors: [],
      characters: ['Samuel', 'Matthew', 'Sarah', 'Kailee'].map((name, index) => ({
        id: IDS[index],
        name,
        appearance: '',
        signatureItems: '',
      })),
    };

    const text = buildBriefingText(briefing);
    const libraryIds = Array.from(text.matchAll(/library:([0-9a-f-]{36})/g), (match) => match[1]);

    expect(libraryIds).toEqual(IDS);
    expect(text).toContain('@samuel');
    expect(text).toContain('@kailee');
  });

  it('prefers a linked Cast & World UUID over a legacy local id', () => {
    const briefing = {
      mode: 'ai',
      productName: 'Linked cast',
      productDescription: 'A sufficiently detailed briefing for one speaker.',
      usps: [],
      targetAudience: '',
      tone: 'professional',
      duration: 30,
      aspectRatio: '9:16',
      brandColors: [],
      characters: [{
        id: 'legacy-local-row',
        brandCharacterId: IDS[0],
        name: 'Samuel',
        appearance: '',
        signatureItems: '',
      }],
    } as ComposerBriefing;

    expect(buildBriefingText(briefing)).toContain(`library:${IDS[0]}`);
  });
});