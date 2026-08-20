import { tx } from "@/lib/i18nText";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Sparkles, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { uiLocale } from '@/lib/uiLocale';

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [shareData, setShareData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadSharedProject();
    }
  }, [token]);

  const loadSharedProject = async () => {
    try {
      setLoading(true);
      
      // Fetch share link
      const { data: shareLink, error: shareLinkError } = await supabase
        .from('project_share_links')
        .select('*, content_projects(*)')
        .eq('share_token', token)
        .single();

      if (shareLinkError || !shareLink) {
        setError(tx({ de: 'Link nicht gefunden oder ungültig', en: 'Link not found or invalid', es: 'Enlace no encontrado o inválido' }));
        return;
      }

      // Check expiry
      if (new Date(shareLink.expires_at) < new Date()) {
        setError(tx({ de: 'Dieser Link ist abgelaufen', en: 'This link has expired', es: 'Este enlace ha caducado' }));
        return;
      }

      // Check view limit
      if (shareLink.max_views && shareLink.current_views >= shareLink.max_views) {
        setError(tx({ de: "Maximale Aufrufe erreicht", en: "Maximum views reached", es: "Máximo de visitas alcanzado" }));
        return;
      }

      // Increment view count
      await supabase
        .from('project_share_links')
        .update({ current_views: shareLink.current_views + 1 })
        .eq('id', shareLink.id);

      setShareData(shareLink);
    } catch (error) {
      console.error('Load shared project error:', error);
      setError(tx({ de: 'Fehler beim Laden des Projekts', en: 'Error loading project', es: 'Error al cargar el proyecto' }));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (shareData?.allow_download && shareData.content_projects?.output_video_url) {
      window.open(shareData.content_projects.output_video_url, '_blank');
      toast.success(tx({ de: "Download gestartet!", en: "Download started!", es: "¡Descarga iniciada!" }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                {tx({ de: "Link nicht verfügbar", en: "Link not available", es: "Enlace no disponible" })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{error}</p>
              <Button onClick={() => navigate('/')} className="w-full">
                {tx({ de: "Zur Startseite", en: "Back to home", es: "Volver al inicio" })}
              </Button>
            </CardContent>
          </Card>
        </div>
    );
  }

  const project = shareData?.content_projects;

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-2xl">
                    🎬 {project?.project_name || 'Shared Project'}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Geteilt von {shareData?.created_by || 'einem Creator'}
                  </p>
                </div>
                <Badge variant="secondary">
                  {project?.status === 'completed' ? tx({ de: '✅ Fertig', en: '✅ Done', es: '✅ Hecho' }) : tx({ de: '🔄 In Bearbeitung', en: '🔄 In progress', es: '🔄 En progreso' })}
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Video Player */}
          {project?.output_video_url && (
            <Card>
              <CardContent className="p-6">
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  <video
                    src={project.output_video_url}
                    controls
                    className="w-full h-full"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Project Details */}
          <Card>
            <CardHeader>
              <CardTitle>{tx({ de: "📝 Projektdetails", en: "📝 Project details", es: "📝 Detalles del proyecto" })}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">{tx({ de: "Content-Type", en: "Content type", es: "Tipo de contenido" })}</div>
                <div className="font-medium capitalize">{project?.content_type}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{tx({ de: "Erstellt am", en: "Created at", es: "Creado el" })}</div>
                <div className="font-medium">
                  {new Date(project?.created_at).toLocaleDateString(uiLocale())}
                </div>
              </div>
              {project?.customizations?.duration && (
                <div>
                  <div className="text-sm text-muted-foreground">{tx({ de: "Dauer", en: "Duration", es: "Duración" })}</div>
                  <div className="font-medium">{project.customizations.duration}s</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            {shareData?.allow_download && project?.output_video_url && (
              <Button onClick={handleDownload} className="flex-1">
                <Download className="mr-2 h-4 w-4" />
                {tx({ de: "Video herunterladen (MP4)", en: "Download video (MP4)", es: "Descargar vídeo (MP4)" })}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate('/content-studio')}
              className="flex-1"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {tx({ de: "Eigenes Video erstellen", en: "Create own video", es: "Crear vídeo propio" })}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}