import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SEO } from '@/components/SEO';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Grid3x3, 
  List, 
  Download, 
  Edit, 
  Copy, 
  Trash2, 
  Play,
  Plus,
  Filter,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';
import { useUnifiedProjects } from '@/hooks/useUnifiedProjects';
import { useVideoHistory } from '@/hooks/useVideoHistory';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';

type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | 'draft' | 'rendering' | 'completed' | 'failed';

export default function UniversalCreatorLibrary() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const { data: projects, isLoading, refetch } = useUnifiedProjects();
  const { deleteVideo, isDeletingVideo } = useVideoHistory();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4" />;
      case 'rendering': return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'failed': return <XCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'rendering': return 'secondary';
      case 'failed': return 'destructive';
      default: return 'outline';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Fertig';
      case 'rendering': return 'Wird erstellt';
      case 'failed': return 'Fehlgeschlagen';
      case 'draft': return 'Entwurf';
      default: return status;
    }
  };

  const filteredProjects = projects?.filter(project => {
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    const matchesSearch = !searchQuery || 
      project.project_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  }) || [];

  const statusCounts = {
    all: projects?.length || 0,
    draft: projects?.filter(p => p.status === 'draft').length || 0,
    rendering: projects?.filter(p => p.status === 'rendering').length || 0,
    completed: projects?.filter(p => p.status === 'completed').length || 0,
    failed: projects?.filter(p => p.status === 'failed').length || 0,
  };

  const handleDownload = async (project: any) => {
    if (!project.output_urls || project.output_urls.length === 0) {
      toast({ 
        title: 'Kein Download verfügbar', 
        description: 'Dieses Projekt hat keine fertigen Videos.',
        variant: 'destructive'
      });
      return;
    }

    const url = project.output_urls[0];
    window.open(url, '_blank');
    
    toast({ title: 'Download gestartet' });
  };

  const handleEdit = (project: any) => {
    if (project.source === 'video_manager') {
      navigate('/universal-directors-cut', { state: { projectId: project.id } });
    } else {
      navigate('/universal-creator', { state: { projectId: project.id } });
    }
  };

  const handleDuplicate = async (project: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const table = project.source === 'video_manager' ? 'video_creations' : 'content_projects';
      
      const { error } = await supabase
        .from(table)
        .insert({
          user_id: user.id,
          project_name: `${project.project_name} (Kopie)`,
          content_type: project.content_type,
          status: 'draft',
          // Copy other relevant fields but not output_urls or IDs
        });

      if (error) throw error;

      toast({ title: 'Projekt dupliziert' });
      refetch();
    } catch (error) {
      console.error('Duplicate error:', error);
      toast({ 
        title: 'Fehler beim Duplizieren',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive'
      });
    }
  };

  const confirmDelete = (projectId: string) => {
    setProjectToDelete(projectId);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!projectToDelete) return;

    try {
      const project = projects?.find(p => p.id === projectToDelete);
      if (!project) return;

      const table = project.source === 'video_manager' ? 'video_creations' : 'content_projects';
      
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', projectToDelete);

      if (error) throw error;

      toast({ title: 'Projekt gelöscht' });
      refetch();
    } catch (error) {
      console.error('Delete error:', error);
      toast({ 
        title: 'Fehler beim Löschen',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive'
      });
    } finally {
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    }
  };

  const ProjectCard = ({ project }: { project: any }) => (
    <Card className="group hover:shadow-lg transition-all duration-200 overflow-hidden">
      <div className="aspect-video bg-muted relative overflow-hidden">
        {project.output_urls && project.output_urls[0] ? (
          <video 
            src={project.output_urls[0]} 
            className="w-full h-full object-cover"
            muted
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          <Badge variant={getStatusVariant(project.status)} className="gap-1">
            {getStatusIcon(project.status)}
            {getStatusLabel(project.status)}
          </Badge>
        </div>
      </div>
      
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">
              {project.project_name || 'Unbenanntes Projekt'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {project.content_type}
            </p>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Filter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {project.status === 'completed' && (
                <>
                  <DropdownMenuItem onClick={() => handleDownload(project)}>
                    <Download className="h-4 w-4 mr-2" />
                    Herunterladen
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => handleEdit(project)}>
                <Edit className="h-4 w-4 mr-2" />
                Bearbeiten
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDuplicate(project)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplizieren
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => confirmDelete(project.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatDistanceToNow(new Date(project.created_at), { addSuffix: true, locale: de })}</span>
          <Badge variant="outline" className="text-xs">
            {project.source === 'video_manager' ? 'Director\'s Cut' : 'Creator'}
          </Badge>
        </div>
      </div>
    </Card>
  );

  return (
    <>
      <SEO 
        title="Video Library | Universal Creator"
        description="Verwalte alle deine erstellten Videos an einem Ort"
      />
      
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">
                Video Library
              </h1>
              <p className="text-muted-foreground">
                Verwalte alle deine erstellten Videos
              </p>
            </div>
            <Button onClick={() => navigate('/universal-creator')} size="lg">
              <Plus className="h-4 w-4 mr-2" />
              Neues Video
            </Button>
          </div>

          {/* Search & View Toggle */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Projekte durchsuchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex gap-1 border border-border rounded-md p-1">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">
              Alle ({statusCounts.all})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Fertig ({statusCounts.completed})
            </TabsTrigger>
            <TabsTrigger value="rendering">
              Rendering ({statusCounts.rendering})
            </TabsTrigger>
            <TabsTrigger value="draft">
              Entwürfe ({statusCounts.draft})
            </TabsTrigger>
            <TabsTrigger value="failed">
              Fehlgeschlagen ({statusCounts.failed})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Projects Grid/List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <Card className="p-12 text-center">
            <Play className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Keine Projekte gefunden</h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery 
                ? 'Keine Projekte passen zu deiner Suche'
                : 'Erstelle dein erstes Video-Projekt'}
            </p>
            <Button onClick={() => navigate('/universal-creator')}>
              <Plus className="h-4 w-4 mr-2" />
              Neues Projekt erstellen
            </Button>
          </Card>
        ) : (
          <div className={viewMode === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
            : 'space-y-4'
          }>
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Projekt löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Das Projekt und alle zugehörigen Daten werden permanent gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              disabled={isDeletingVideo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingVideo ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird gelöscht...
                </>
              ) : (
                'Löschen'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
