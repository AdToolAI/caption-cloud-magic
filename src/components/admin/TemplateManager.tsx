import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Search, Edit, Trash2, Eye, RefreshCw } from 'lucide-react';
import { useTemplates, useInvalidateTemplateCache } from '@/hooks/useTemplateData';
import { toast } from 'sonner';

export const TemplateManager = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | undefined>();
  
  const { data: templates, isLoading, refetch } = useTemplates(selectedType);
  const { invalidateTemplates } = useInvalidateTemplateCache();

  const filteredTemplates = templates?.filter(template =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRefresh = async () => {
    invalidateTemplates();
    await refetch();
    toast.success('Templates aktualisiert');
  };

  const contentTypes = ['ad', 'story', 'reel', 'tutorial', 'testimonial', 'news'];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Template-Verwaltung</h2>
            <p className="text-sm text-muted-foreground">
              {filteredTemplates?.length || 0} Templates gefunden
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleRefresh} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Aktualisieren
            </Button>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Neues Template
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="space-y-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Templates durchsuchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedType === undefined ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedType(undefined)}
            >
              Alle
            </Button>
            {contentTypes.map(type => (
              <Button
                key={type}
                variant={selectedType === type ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedType(type)}
              >
                {type}
              </Button>
            ))}
          </div>
        </div>

        {/* Templates List */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Lade Templates...
          </div>
        ) : filteredTemplates?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Keine Templates gefunden
          </div>
        ) : (
          <ScrollArea className="h-[600px]">
            <div className="space-y-3">
              {filteredTemplates?.map((template) => (
                <Card key={template.id} className="p-4 hover:bg-accent/5 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold truncate">{template.name}</h3>
                        <Badge variant="secondary" className="capitalize">
                          {template.content_type}
                        </Badge>
                        {template.remotion_component_id && (
                          <Badge variant="outline">
                            {template.remotion_component_id}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {template.description}
                      </p>
                      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                        <span>Kategorie: {template.category}</span>
                        <span>•</span>
                        <span>Plattform: {template.platform}</span>
                        <span>•</span>
                        <span>{template.customizable_fields.length} Felder</span>
                        <span>•</span>
                        <span>
                          Dauer: {template.duration_min}-{template.duration_max}s
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* AI Features */}
                  {template.ai_features.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {template.ai_features.map((feature, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
};
