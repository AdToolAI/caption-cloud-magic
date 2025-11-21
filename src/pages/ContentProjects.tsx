import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Download, Play, RefreshCw, Loader2, Film, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { SEO } from "@/components/SEO";

export default function ContentProjects() {
  const { t } = useTranslation();
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const { data: projects, isLoading, refetch } = useQuery({
    queryKey: ["content-projects", selectedStatus],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let query = supabase
        .from("content_projects")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (selectedStatus !== "all") {
        query = query.eq("status", selectedStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const getStatusBadge = (status: string) => {
    const variants = {
      draft: { variant: "secondary" as const, icon: Clock, label: "Entwurf", className: "" },
      rendering: { variant: "default" as const, icon: RefreshCw, label: "Wird gerendert...", className: "" },
      completed: { variant: "outline" as const, icon: CheckCircle2, label: "Fertig", className: "border-green-500 text-green-700" },
      failed: { variant: "destructive" as const, icon: XCircle, label: "Fehler", className: "" },
    };

    const config = variants[status as keyof typeof variants] || variants.draft;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className={`flex items-center gap-1 ${config.className}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename || "video.mp4";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      toast.success("Video wird heruntergeladen");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Fehler beim Herunterladen");
    }
  };

  const getOutputUrls = (project: any): string[] => {
    if (!project.output_urls) return [];
    if (Array.isArray(project.output_urls)) return project.output_urls as string[];
    if (typeof project.output_urls === "string") return [project.output_urls];
    return [];
  };

  const statusCounts = {
    all: projects?.length || 0,
    draft: projects?.filter((p) => p.status === "draft").length || 0,
    rendering: projects?.filter((p) => p.status === "rendering").length || 0,
    completed: projects?.filter((p) => p.status === "completed").length || 0,
    failed: projects?.filter((p) => p.status === "failed").length || 0,
  };

  return (
    <>
      <SEO 
        title="Meine Videos | Content Studio"
        description="Verwalte deine erstellten Video-Projekte aus dem Content Studio"
      />
      <div className="container max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Meine Videos</h1>
          <p className="text-muted-foreground">
            Verwalte deine erstellten Video-Projekte aus dem Content Studio
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Gesamt</CardDescription>
              <CardTitle className="text-3xl">{statusCounts.all}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fertig</CardDescription>
              <CardTitle className="text-3xl text-green-600">{statusCounts.completed}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>In Bearbeitung</CardDescription>
              <CardTitle className="text-3xl text-blue-600">{statusCounts.rendering}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Entwürfe</CardDescription>
              <CardTitle className="text-3xl text-gray-600">{statusCounts.draft}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filter Tabs */}
        <Tabs value={selectedStatus} onValueChange={setSelectedStatus} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">Alle ({statusCounts.all})</TabsTrigger>
            <TabsTrigger value="completed">Fertig ({statusCounts.completed})</TabsTrigger>
            <TabsTrigger value="rendering">Rendering ({statusCounts.rendering})</TabsTrigger>
            <TabsTrigger value="draft">Entwürfe ({statusCounts.draft})</TabsTrigger>
            <TabsTrigger value="failed">Fehler ({statusCounts.failed})</TabsTrigger>
          </TabsList>

          <TabsContent value={selectedStatus} className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : projects && projects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => {
                  const outputUrls = getOutputUrls(project);
                  return (
                    <Card key={project.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                      <div className="aspect-video bg-muted relative">
                        {outputUrls.length > 0 ? (
                          <video
                            src={outputUrls[0]}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Film className="h-12 w-12 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-lg line-clamp-2">
                            {project.project_name}
                          </CardTitle>
                          {getStatusBadge(project.status)}
                        </div>
                        <CardDescription>
                          {format(new Date(project.created_at), "PPP", { locale: de })}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Film className="h-4 w-4" />
                          <span>{project.content_type}</span>
                        </div>
                        {project.status === "completed" && outputUrls.length > 0 && (
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => window.open(outputUrls[0], "_blank")}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Ansehen
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => handleDownload(outputUrls[0], `${project.project_name}.mp4`)}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                          </div>
                        )}
                        {project.status === "rendering" && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span>Video wird erstellt...</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Film className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <CardTitle className="mb-2">Keine Videos gefunden</CardTitle>
                  <CardDescription>
                    {selectedStatus === "all"
                      ? "Erstelle dein erstes Video im Content Studio"
                      : `Keine Videos mit Status "${selectedStatus}"`}
                  </CardDescription>
                  <Button className="mt-4" onClick={() => window.location.href = "/content-studio"}>
                    Zum Content Studio
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
