import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Database } from '@/integrations/supabase/types';

type ABTest = Database['public']['Tables']['ab_tests']['Row'];
type ABTestVariant = Database['public']['Tables']['ab_test_variants']['Row'];
type ABTestInsight = Database['public']['Tables']['ab_test_insights']['Row'];

export interface ABTestWithVariants extends ABTest {
  variants: ABTestVariant[];
  insights?: ABTestInsight[];
}

export function useABTests() {
  const [tests, setTests] = useState<ABTestWithVariants[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTests = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data: testsData, error } = await supabase
        .from('ab_tests')
        .select('*, ab_test_variants(*), ab_test_insights(*)')
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setTests(testsData.map(test => ({
        ...test,
        variants: test.ab_test_variants || [],
        insights: test.ab_test_insights || []
      })));
    } catch (error) {
      console.error('Failed to fetch A/B tests:', error);
      toast({
        title: 'Fehler beim Laden',
        description: 'A/B Tests konnten nicht geladen werden',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const createTest = async (testData: {
    template_id: string;
    test_name: string;
    hypothesis?: string;
    target_metric?: string;
  }) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('ab_tests')
        .insert({
          user_id: user.user.id,
          ...testData
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Test erstellt',
        description: 'A/B Test wurde erfolgreich erstellt'
      });

      fetchTests();
      return data;
    } catch (error) {
      console.error('Failed to create test:', error);
      toast({
        title: 'Fehler',
        description: 'Test konnte nicht erstellt werden',
        variant: 'destructive'
      });
      return null;
    }
  };

  const createVariant = async (testId: string, variantData: {
    variant_name: string;
    variant_type: 'control' | 'variant';
    customizations?: any;
    thumbnail_config?: any;
    text_config?: any;
    color_config?: any;
  }) => {
    try {
      // Create a mock draft_id for now (or fetch actual draft if needed)
      const { error } = await supabase
        .from('ab_test_variants')
        .insert({
          draft_id: testId, // Using test_id as draft_id temporarily
          variant_name: variantData.variant_name,
          variant_type: variantData.variant_type,
          caption: '', // Required field
          hook: '', // Required field
          hashtag_set: '', // Required field
          customizations: variantData.customizations,
          thumbnail_config: variantData.thumbnail_config,
          text_config: variantData.text_config,
          color_config: variantData.color_config
        });

      if (error) throw error;

      toast({
        title: 'Variante erstellt',
        description: 'Test-Variante wurde hinzugefügt'
      });

      fetchTests();
    } catch (error) {
      console.error('Failed to create variant:', error);
      toast({
        title: 'Fehler',
        description: 'Variante konnte nicht erstellt werden',
        variant: 'destructive'
      });
    }
  };

  const startTest = async (testId: string) => {
    try {
      const { error } = await supabase
        .from('ab_tests')
        .update({
          status: 'running',
          started_at: new Date().toISOString()
        })
        .eq('id', testId);

      if (error) throw error;

      toast({
        title: 'Test gestartet',
        description: 'A/B Test läuft jetzt'
      });

      fetchTests();
    } catch (error) {
      console.error('Failed to start test:', error);
      toast({
        title: 'Fehler',
        description: 'Test konnte nicht gestartet werden',
        variant: 'destructive'
      });
    }
  };

  const stopTest = async (testId: string) => {
    try {
      const { error } = await supabase
        .from('ab_tests')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString()
        })
        .eq('id', testId);

      if (error) throw error;

      toast({
        title: 'Test beendet',
        description: 'A/B Test wurde gestoppt'
      });

      fetchTests();
    } catch (error) {
      console.error('Failed to stop test:', error);
      toast({
        title: 'Fehler',
        description: 'Test konnte nicht gestoppt werden',
        variant: 'destructive'
      });
    }
  };

  const trackEvent = async (
    variantId: string,
    eventType: 'impression' | 'view' | 'engagement' | 'conversion' | 'watch_time',
    eventValue?: number
  ) => {
    try {
      // Get test_id from variant
      const { data: variant } = await supabase
        .from('ab_test_variants')
        .select('test_id')
        .eq('id', variantId)
        .single();

      if (!variant) throw new Error('Variant not found');

      const { error } = await supabase
        .from('ab_test_events')
        .insert({
          test_id: variant.test_id,
          variant_id: variantId,
          event_type: eventType,
          event_value: eventValue
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to track event:', error);
    }
  };

  const declareWinner = async (testId: string, winnerVariantId: string) => {
    try {
      const { error } = await supabase
        .from('ab_tests')
        .update({
          winner_variant_id: winnerVariantId,
          status: 'completed',
          ended_at: new Date().toISOString()
        })
        .eq('id', testId);

      if (error) throw error;

      toast({
        title: '🏆 Winner deklariert',
        description: 'Beste Variante wurde als Winner markiert'
      });

      fetchTests();
    } catch (error) {
      console.error('Failed to declare winner:', error);
      toast({
        title: 'Fehler',
        description: 'Winner konnte nicht deklariert werden',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    fetchTests();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('ab_tests_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ab_tests'
      }, () => {
        fetchTests();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ab_test_variants'
      }, () => {
        fetchTests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    tests,
    loading,
    createTest,
    createVariant,
    startTest,
    stopTest,
    trackEvent,
    declareWinner,
    refetch: fetchTests
  };
}
