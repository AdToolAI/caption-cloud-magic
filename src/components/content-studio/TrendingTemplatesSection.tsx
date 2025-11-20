import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Flame, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ContentTemplate } from '@/types/content-studio';

interface TrendingTemplate extends ContentTemplate {
  trend_score: number;
  trending_reason: string;
  trend_hashtags: string[];
}

interface TrendingTemplatesSectionProps {
  contentType: string;
  platform?: string;
  allTemplates: ContentTemplate[];
  selectedTemplate: ContentTemplate | null;
  onSelectTemplate: (template: ContentTemplate) => void;
  renderTemplateCard: (template: ContentTemplate) => React.ReactNode;
}

export const TrendingTemplatesSection = ({
  contentType,
  platform,
  allTemplates,
  selectedTemplate,
  onSelectTemplate,
  renderTemplateCard
}: TrendingTemplatesSectionProps) => {
  const [activeTab, setActiveTab] = useState<'all' | 'trending'>('all');

  const { data: trendingTemplates, isLoading } = useQuery({
    queryKey: ['trending-templates', contentType, platform],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-trending-templates', {
        body: { content_type: contentType, platform }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      return data.trending_templates as TrendingTemplate[];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'trending')} className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="all">
          Alle Templates
        </TabsTrigger>
        <TabsTrigger value="trending" className="gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          Im Trend
        </TabsTrigger>
      </TabsList>

      <TabsContent value="all" className="mt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allTemplates.map(template => renderTemplateCard(template))}
        </div>
      </TabsContent>

      <TabsContent value="trending" className="mt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !trendingTemplates || trendingTemplates.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Flame className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold text-lg mb-2">Keine Trending Templates verfügbar</h3>
              <p className="text-muted-foreground">
                Schau dir stattdessen alle verfügbaren Templates an
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trendingTemplates.map(template => (
              <Card
                key={template.id}
                className={`group hover:shadow-xl transition-all cursor-pointer relative overflow-hidden ${
                  selectedTemplate?.id === template.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => onSelectTemplate(template)}
              >
                {/* Trending Badge */}
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-gradient-to-r from-orange-500 to-red-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                  <Flame className="h-3 w-3" />
                  {template.trend_score}
                </div>

                <CardContent className="p-0">
                  {template.thumbnail_url && (
                    <div className="relative aspect-video bg-muted overflow-hidden">
                      <img
                        src={template.thumbnail_url}
                        alt={template.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                  )}

                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">
                        {template.name}
                      </h3>
                      {template.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {template.description}
                        </p>
                      )}
                    </div>

                    {/* Trending Reason */}
                    <div className="flex items-center gap-2 p-2 bg-orange-500/10 rounded-lg">
                      <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
                        🔥 {template.trending_reason}
                      </span>
                    </div>

                    {/* Trend Hashtags */}
                    {template.trend_hashtags && template.trend_hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {template.trend_hashtags.map((tag, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Template Info */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      {template.category && (
                        <Badge variant="outline" className="text-xs">
                          {template.category}
                        </Badge>
                      )}
                      {template.platform && (
                        <Badge variant="outline" className="text-xs">
                          {template.platform}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
};
