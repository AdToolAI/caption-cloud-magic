import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Trash2, Play, Loader2, FolderHeart, Sparkles, Wand2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface UserTemplate {
  id: string;
  name: string;
  description: string;
  content_type: string;
  category: string;
  platform: string;
  platforms: string[];
  aspect_ratios: string[];
  thumbnail_url: string | null;
  created_at: string;
  is_public: boolean;
}

export default function MyTemplates() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'custom' | 'generated'>('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadTemplates();
    }
  }, [user, filter]);

  const loadTemplates = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('content_templates')
        .select('id, name, description, content_type, category, platform, platforms, aspect_ratios, thumbnail_url, created_at, is_public')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (filter === 'custom') {
        query = query.eq('category', 'custom');
      } else if (filter === 'generated') {
        query = query.eq('category', 'generated');
      }

      const { data, error } = await query;

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Fehler beim Laden der Templates');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Möchtest du dieses Template wirklich löschen?')) return;
    
    setDeleting(templateId);
    try {
      const { error } = await supabase
        .from('content_templates')
        .delete()
        .eq('id', templateId)
        .eq('created_by', user?.id);

      if (error) throw error;
      
      setTemplates(prev => prev.filter(t => t.id !== templateId));
      toast.success('Template gelöscht');
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Fehler beim Löschen');
    } finally {
      setDeleting(null);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'generated':
        return <Sparkles className="h-4 w-4" />;
      case 'custom':
        return <Wand2 className="h-4 w-4" />;
      default:
        return <FolderHeart className="h-4 w-4" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'generated':
        return 'KI-generiert';
      case 'custom':
        return 'Selbst erstellt';
      default:
        return category;
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/content-studio')}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
            Meine Templates
          </h1>
          <p className="text-muted-foreground">
            Deine selbst erstellten und KI-generierten Templates
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList className="bg-card/60 backdrop-blur-xl border border-white/10">
          <TabsTrigger value="all" className="data-[state=active]:bg-primary/20">
            Alle
          </TabsTrigger>
          <TabsTrigger value="custom" className="data-[state=active]:bg-primary/20">
            <Wand2 className="h-4 w-4 mr-2" />
            Selbst erstellt
          </TabsTrigger>
          <TabsTrigger value="generated" className="data-[state=active]:bg-primary/20">
            <Sparkles className="h-4 w-4 mr-2" />
            KI-generiert
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : templates.length === 0 ? (
        <Card className="border-white/10 bg-card/60 backdrop-blur-xl">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FolderHeart className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Keine Templates gefunden</h3>
            <p className="text-muted-foreground mb-6">
              {filter === 'all' 
                ? 'Du hast noch keine eigenen Templates erstellt.'
                : filter === 'custom'
                ? 'Du hast noch keine eigenen Templates manuell erstellt.'
                : 'Du hast noch keine Templates mit KI generiert.'}
            </p>
            <div className="flex gap-3">
              <Button onClick={() => navigate('/content-studio/editor')}>
                <Wand2 className="h-4 w-4 mr-2" />
                Template erstellen
              </Button>
              <Button variant="outline" onClick={() => navigate('/template-generator')}>
                <Sparkles className="h-4 w-4 mr-2" />
                Mit KI generieren
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {templates.map((template, index) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
            >
              <Card 
                className="group overflow-hidden border-white/10 bg-card/60 backdrop-blur-xl hover:border-white/20 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10"
              >
                {/* Thumbnail */}
                <div className="relative h-40 bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                  {template.thumbnail_url ? (
                    <img 
                      src={template.thumbnail_url} 
                      alt={template.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FolderHeart className="h-16 w-16 text-amber-400/50" />
                  )}
                  
                  {/* Category Badge */}
                  <div className="absolute top-3 left-3">
                    <Badge 
                      variant="secondary" 
                      className="bg-black/50 text-white backdrop-blur-md border border-white/10"
                    >
                      {getCategoryIcon(template.category)}
                      <span className="ml-1">{getCategoryLabel(template.category)}</span>
                    </Badge>
                  </div>

                  {/* Platform Badge */}
                  <div className="absolute top-3 right-3">
                    <Badge 
                      variant="secondary" 
                      className="bg-white/20 text-white backdrop-blur-md border border-white/10 capitalize"
                    >
                      {template.platform}
                    </Badge>
                  </div>

                  {/* Hover Actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <Button 
                      size="sm" 
                      onClick={() => navigate(`/content-studio/editor/${template.id}`)}
                      className="bg-primary hover:bg-primary/80"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Bearbeiten
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(template.id)}
                      disabled={deleting === template.id}
                    >
                      {deleting === template.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Content */}
                <CardContent className="p-4">
                  <h3 className="font-semibold truncate mb-1">{template.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {template.description || 'Keine Beschreibung'}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{template.aspect_ratios?.[0] || '9:16'}</span>
                    <span>
                      {new Date(template.created_at).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Button FAB */}
      <div className="fixed bottom-8 right-8 flex gap-3">
        <Button
          size="lg"
          className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/25"
          onClick={() => navigate('/content-studio/editor')}
        >
          <Wand2 className="h-5 w-5 mr-2" />
          Neues Template
        </Button>
      </div>
    </div>
  );
}
