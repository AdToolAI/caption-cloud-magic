import { describe, it, expect } from 'vitest';
import {
  TEXT_MODELS,
  DEFAULT_TEXT_MODEL,
  resolveModelId,
} from '@/lib/text-studio/models';

// Client registry must stay in sync with the server routes in
// supabase/functions/text-studio-chat|compare (PROVIDER_MAP).
const SERVER_API_MODELS: Record<string, string> = {
  'openai-gpt-5-6-luna': 'openai/gpt-5.6-luna',
  'openai-gpt-5-6-terra': 'openai/gpt-5.6-terra',
  'openai-gpt-5-6-sol': 'openai/gpt-5.6-sol',
  'openai-gpt-6-astra': 'openai/gpt-6-astra',
  'google-gemini-3-1-flash-lite': 'google/gemini-3.1-flash-lite',
  'google-gemini-3-8-flash': 'google/gemini-3.8-flash',
  'google-gemini-3-1-pro': 'google/gemini-3.1-pro-preview',
  'anthropic-claude-4-1-opus': 'claude-opus-4-1',
};

describe('text studio model registry', () => {
  it('mirrors the server provider map exactly', () => {
    expect(Object.keys(TEXT_MODELS).sort()).toEqual(Object.keys(SERVER_API_MODELS).sort());
    for (const [id, apiModel] of Object.entries(SERVER_API_MODELS)) {
      expect(TEXT_MODELS[id as keyof typeof TEXT_MODELS].apiModel).toBe(apiModel);
    }
  });

  it('maps the retired Gemini 3.6 Flash id onto its successor', () => {
    expect(resolveModelId('google-gemini-3-6-flash')).toBe('google-gemini-3-8-flash');
    expect(resolveModelId('openai-gpt-5-5-pro')).toBe('openai-gpt-5-6-sol');
    expect(DEFAULT_TEXT_MODEL).toBe('google-gemini-3-8-flash');
  });

  it('marks GPT-6 Astra as always reasoning', () => {
    expect(TEXT_MODELS['openai-gpt-6-astra'].requiresReasoning).toBe(true);
  });
});
