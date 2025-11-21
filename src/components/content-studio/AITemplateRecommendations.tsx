import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import type { ContentTemplate } from '@/types/content-studio';

interface Recommendation {
  template_id: string;
  confidence: number;
  reason: string;
  template: ContentTemplate | null;
}

interface AITemplateRecommendationsProps {
  contentType: 'ad' | 'story' | 'reel' | 'tutorial' | 'testimonial' | 'news';
  brief: string;
  brandKitId?: string;
  onSelectTemplate: (template: ContentTemplate) => void;
}

export const AITemplateRecommendations = ({
  contentType,
  brief,
  brandKitId,
  onSelectTemplate
}: AITemplateRecommendationsProps) => {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    fetchUser();
  }, []);

  // Fetch AI recommendations
  const { data: aiData, isLoading: aiLoading, error: aiError } = useQuery({
    queryKey: ['ai-recommendations', contentType, brief, brandKitId],
    queryFn: async () => {
      if (!userId || brief.length < 20) return null;

      const { data, error } = await supabase.functions.invoke('recommend-templates', {
        body: {
          user_id: userId,
          content_type: contentType,
          brief,
          brand_kit_id: brandKitId
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      return data.recommendations as Recommendation[];
    },
    enabled: !!userId && brief.length >= 20,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch personalized recommendations
  const { data: personalizedData, isLoading: personalizedLoading } = useQuery({
    queryKey: ['personalized-recommendations', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase.functions.invoke('get-personalized-recommendations');
      if (error) throw error;
      
      return data;
    },
    enabled: !!userId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const data = aiData;
  const isLoading = aiLoading || personalizedLoading;
  const error = aiError;

  if (!userId || brief.length < 20) {
    return null;
  }

  if (error) {
    console.error('AI recommendations error:', error);
    return null; // Fail silently, user can still browse templates
  }

  if (isLoading) {
    return (
      <Card className="mb-8 border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-purple-500/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">🤖 AI empfiehlt</h3>
              <p className="text-sm text-muted-foreground">Analysiert deine Anforderungen...</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-32 bg-muted rounded-lg mb-3" />
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <Card className="mb-8 border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-purple-500/5">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">🤖 AI empfiehlt für dein Projekt</h3>
            <p className="text-sm text-muted-foreground">
              Basierend auf deinem Brief, Brand und Nutzungsverhalten
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.map((rec) => {
            if (!rec.template) return null;

            const topTemplateIds = personalizedData?.templates?.map((t: any) => t.id) || [];
            const isPersonalized = topTemplateIds.includes(rec.template_id);

            return (
              <Card
                key={rec.template_id}
                className="group hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary"
                onClick={() => onSelectTemplate(rec.template)}
              >
                <CardContent className="p-4 space-y-3">
                  {rec.template.thumbnail_url && (
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                      <img
                        src={rec.template.thumbnail_url}
                        alt={rec.template.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <Badge className="absolute top-2 right-2 bg-primary text-primary-foreground">
                        {rec.confidence}% Match
                      </Badge>
                      {isPersonalized && (
                        <Badge className="absolute top-2 left-2 bg-purple-500 text-white">
                          ⭐ Für dich
                        </Badge>
                      )}
                    </div>
                  )}

                  <div>
                    <h4 className="font-semibold text-sm mb-1 line-clamp-1">
                      {rec.template.name}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {rec.reason}
                    </p>
                  </div>

                  <Button size="sm" className="w-full">
                    Template verwenden
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
