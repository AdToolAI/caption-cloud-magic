import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { 
  Search, 
  Plus,
  Filter,
  Grid3x3,
  List,
  Star,
  Clock,
} from 'lucide-react';
import { TemplateCard } from '@/components/templates/TemplateCard';
import { TemplatePreview } from '@/components/templates/TemplatePreview';
import { useTemplates } from '@/hooks/useTemplates';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function TemplateLibrary() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  const {
    templates,
    isLoading,
    duplicateTemplate,
    deleteTemplate,
    isDuplicating,
    isDeleting,
  } = useTemplates();

  const categories = [
    { value: 'all', label: 'Alle' },
    { value: 'social_media', label: 'Social Media' },
    { value: 'advertising', label: 'Werbung' },
    { value: 'explainer', label: 'Erklärvideos' },
    { value: 'tutorial', label: 'Tutorials' },
    { value: 'testimonial', label: 'Testimonials' },
    { value: 'product_showcase', label: 'Produktpräsentation' },
    { value: 'event', label: 'Events' },
    { value: 'educational', label: 'Bildung' },
    { value: 'entertainment', label: 'Unterhaltung' },
    { value: 'other', label: 'Sonstige' },
  ];

  const filteredTemplates = templates?.filter((template) => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const featuredTemplates = templates?.filter(t => t.is_featured);
  const recentTemplates = templates?.slice(0, 6);

  const handleUseTemplate = (template: any) => {
    navigate(`/video-creator?template_id=${template.id}`);
  };

  const handlePreview = (template: any) => {
    setSelectedTemplate(template);
    setShowPreview(true);
  };

  const handleEdit = (template: any) => {
    navigate(`/template-editor?id=${template.id}`);
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Template-Bibliothek</h1>
          <p className="text-muted-foreground mt-1">
            Wähle ein Template aus und erstelle dein Video in wenigen Minuten
          </p>
        </div>
        <Button onClick={() => navigate('/template-editor')}>
          <Plus className="mr-2 h-4 w-4" />
          Neues Template
        </Button>
      </div>

      {/* Featured Section */}
      {featuredTemplates && featuredTemplates.length > 0 && (
        <Card className="p-6 bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center gap-2 mb-4">
            <Star className="h-5 w-5 text-yellow-500" />
            <h2 className="text-xl font-semibold">Featured Templates</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredTemplates.slice(0, 3).map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onPreview={handlePreview}
                onEdit={handleEdit}
                onDuplicate={duplicateTemplate}
                onDelete={deleteTemplate}
                onUse={handleUseTemplate}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Templates durchsuchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
          <TabsList>
            <TabsTrigger value="grid">
              <Grid3x3 className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="list">
              <List className="h-4 w-4" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Templates Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">
            Alle Templates
            {filteredTemplates && (
              <Badge variant="secondary" className="ml-2">
                {filteredTemplates.length}
              </Badge>
            )}
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="p-4 space-y-4">
                <div className="aspect-video bg-muted rounded animate-pulse" />
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-3 bg-muted rounded w-2/3 animate-pulse" />
                </div>
              </Card>
            ))}
          </div>
        ) : filteredTemplates && filteredTemplates.length > 0 ? (
          <div className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
              : 'flex flex-col gap-4'
          }>
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onPreview={handlePreview}
                onEdit={handleEdit}
                onDuplicate={duplicateTemplate}
                onDelete={deleteTemplate}
                onUse={handleUseTemplate}
              />
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">
              Keine Templates gefunden. Versuche eine andere Suche.
            </p>
          </Card>
        )}
      </div>

      {/* Template Preview Dialog */}
      <TemplatePreview
        template={selectedTemplate}
        open={showPreview}
        onClose={() => setShowPreview(false)}
        onUse={handleUseTemplate}
        onDuplicate={duplicateTemplate}
      />
    </div>
  );
}
