import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { PostTimelineBuilder } from "./PostTimelineBuilder";

interface Template {
  id: string;
  name: string;
  description: string | null;
  template_type: string;
  duration_days: number;
  events_json: any;
  is_public: boolean;
  workspace_id: string | null;
  created_by: string | null;
}

interface TemplateBuilderDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  template?: Template | null;
}

export function TemplateBuilderDialog({
  open,
  onClose,
  onSaved,
  template,
}: TemplateBuilderDialogProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateType, setTemplateType] = useState("product_launch");
  const [durationDays, setDurationDays] = useState(7);
  const [isPublic, setIsPublic] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || "");
      setTemplateType(template.template_type);
      setDurationDays(template.duration_days);
      setIsPublic(template.is_public);
      // Migrate old posts to new structure with defaults
      const migratedPosts = (Array.isArray(template.events_json) ? template.events_json : []).map((post: any) => ({
        day: post.day || 1,
        title: post.title || "",
        brief: post.brief || "",
        caption: post.caption || "",
        channels: post.channels || [],
        hashtags: post.hashtags || [],
        eta_minutes: post.eta_minutes || 30,
        postType: post.postType || "image",
        mediaUrl: post.mediaUrl,
        mediaType: post.mediaType,
        importedFromAI: post.importedFromAI,
        sourceContentId: post.sourceContentId,
      }));
      setPosts(migratedPosts);
    } else {
      // Reset form for new template
      setName("");
      setDescription("");
      setTemplateType("product_launch");
      setDurationDays(7);
      setIsPublic(false);
      setPosts([]);
    }
  }, [template, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Name fehlt",
        description: "Bitte gib einen Namen für das Template ein.",
        variant: "destructive",
      });
      return;
    }

    if (posts.length === 0) {
      toast({
        title: "Keine Posts",
        description: "Bitte füge mindestens einen Post hinzu.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);

      // Fetch user's default workspace
      const { data: workspaces } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_id", user?.id)
        .limit(1)
        .single();

      const templateData = {
        name: name.trim(),
        description: description.trim() || null,
        template_type: templateType,
        duration_days: durationDays,
        events_json: posts,
        is_public: isPublic,
        workspace_id: workspaces?.id,
        created_by: user?.id,
      };

      let error;
      if (template) {
        // Update existing
        const result = await supabase
          .from("calendar_campaign_templates")
          .update(templateData)
          .eq("id", template.id);
        error = result.error;
      } else {
        // Create new
        const result = await supabase
          .from("calendar_campaign_templates")
          .insert(templateData);
        error = result.error;
      }

      if (error) throw error;

      toast({
        title: template ? "Template aktualisiert" : "Template erstellt",
        description: template 
          ? "Das Template wurde erfolgreich aktualisiert."
          : "Das Template wurde erfolgreich erstellt.",
      });

      onSaved();
      onClose();
    } catch (error) {
      console.error("Error saving template:", error);
      toast({
        title: "Fehler",
        description: "Template konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? "Template bearbeiten" : "Neues Template erstellen"}
          </DialogTitle>
          <DialogDescription>
            Erstelle eine wiederverwendbare Kampagnen-Vorlage mit mehreren Posts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Template-Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Black Friday Sale 2025"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Beschreibe wofür dieses Template verwendet werden soll..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Kategorie</Label>
                <Select value={templateType} onValueChange={setTemplateType}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Kategorie wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product_launch">Produktlaunch</SelectItem>
                    <SelectItem value="social_sale">Sale</SelectItem>
                    <SelectItem value="seasonal">Saison</SelectItem>
                    <SelectItem value="educational">Bildung</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="duration">Dauer (Tage)</Label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  max="365"
                  value={durationDays}
                  onChange={(e) => setDurationDays(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Öffentlich machen</Label>
                <p className="text-sm text-muted-foreground">
                  Für alle Workspace-Mitglieder sichtbar
                </p>
              </div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
          </div>

          {/* Post Timeline Builder */}
          <div className="border-t pt-6">
            <PostTimelineBuilder
              posts={posts}
              onChange={setPosts}
              maxDuration={durationDays}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Speichert..." : template ? "Aktualisieren" : "Erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}