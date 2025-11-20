import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Sparkles, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
        setError('Link nicht gefunden oder ungültig');
        return;
      }

      // Check expiry
      if (new Date(shareLink.expires_at) < new Date()) {
        setError('Dieser Link ist abgelaufen');
        return;
      }

      // Check view limit
      if (shareLink.max_views && shareLink.current_views >= shareLink.max_views) {
        setError('Maximale Aufrufe erreicht');
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
      setError('Fehler beim Laden des Projekts');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (shareData?.allow_download && shareData.content_projects?.output_video_url) {
      window.open(shareData.content_projects.output_video_url, '_blank');
      toast.success("Download gestartet!");
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
                Link nicht verfügbar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{error}</p>
              <Button onClick={() => navigate('/')} className="w-full">
                Zur Startseite
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
                  {project?.status === 'completed' ? '✅ Fertig' : '🔄 In Bearbeitung'}
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
              <CardTitle>📝 Projektdetails</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Content-Type</div>
                <div className="font-medium capitalize">{project?.content_type}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Erstellt am</div>
                <div className="font-medium">
                  {new Date(project?.created_at).toLocaleDateString('de-DE')}
                </div>
              </div>
              {project?.customizations?.duration && (
                <div>
                  <div className="text-sm text-muted-foreground">Dauer</div>
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
                Video herunterladen (MP4)
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate('/content-studio')}
              className="flex-1"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Eigenes Video erstellen
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}