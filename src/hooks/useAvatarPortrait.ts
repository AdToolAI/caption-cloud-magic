import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export interface AvatarPortraitResult {
  success: boolean;
  portrait_url: string;
  portrait_mode: 'auto_generated';
}

/**
 * Generate a Hedra-optimized frontal portrait for an avatar via Gemini Image edit.
 * Calls the `generate-avatar-portrait` edge function.
 */
export function useAvatarPortrait() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const generate = async (characterId: string): Promise<AvatarPortraitResult | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-avatar-portrait', {
        body: { character_id: characterId },
      });
      if (error) throw error;
      if (!data?.portrait_url) throw new Error('No portrait returned');

      queryClient.invalidateQueries({ queryKey: ['brand-characters'] });
      toast({
        title: 'Portrait generated',
        description: 'Hedra-optimized frontal portrait saved to this avatar.',
      });
      return data as AvatarPortraitResult;
    } catch (e) {
      console.error('[useAvatarPortrait] error', e);
      toast({
        title: 'Portrait generation failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { loading, generate };
}
