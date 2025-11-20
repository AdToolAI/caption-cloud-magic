import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link, Users, Copy, Check, X, Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProjectSharingProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectSharing({ projectId, isOpen, onClose }: ProjectSharingProps) {
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Link settings
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowComments, setAllowComments] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [expiryDays, setExpiryDays] = useState("7");
  
  // Collaborator settings
  const [collaboratorEmail, setCollaboratorEmail] = useState("");
  const [collaboratorRole, setCollaboratorRole] = useState("viewer");
  const [addingCollaborator, setAddingCollaborator] = useState(false);

  const generateShareLink = async () => {
    setLoading(true);
    try {
      const expirySeconds = parseInt(expiryDays) * 24 * 60 * 60;
      
      const { data, error } = await supabase.functions.invoke('generate-share-link', {
        body: {
          project_id: projectId,
          expires_in_seconds: expirySeconds,
          allow_download: allowDownload,
          allow_comments: allowComments,
          require_password: requirePassword,
          password: requirePassword ? password : undefined
        }
      });

      if (error) throw error;
      
      setShareLink(data.share_url);
      toast.success("Share-Link erfolgreich erstellt!");
    } catch (error) {
      console.error('Share link error:', error);
      toast.error((error as Error).message || 'Fehler beim Erstellen des Links');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      setCopied(true);
      toast.success("Link kopiert!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const addCollaborator = async () => {
    if (!collaboratorEmail) {
      toast.error("Bitte E-Mail-Adresse eingeben");
      return;
    }

    setAddingCollaborator(true);
    try {
      const { data, error } = await supabase.functions.invoke('add-collaborator', {
        body: {
          project_id: projectId,
          collaborator_email: collaboratorEmail,
          role: collaboratorRole
        }
      });

      if (error) throw error;
      
      toast.success(`Einladung an ${collaboratorEmail} gesendet!`);
      setCollaboratorEmail("");
    } catch (error) {
      console.error('Add collaborator error:', error);
      toast.error((error as Error).message || 'Fehler beim Hinzufügen');
    } finally {
      setAddingCollaborator(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>🔗 Projekt teilen</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="link" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link">
              <Link className="h-4 w-4 mr-2" />
              Öffentlicher Link
            </TabsTrigger>
            <TabsTrigger value="team">
              <Users className="h-4 w-4 mr-2" />
              Team
            </TabsTrigger>
          </TabsList>

          {/* Public Link Tab */}
          <TabsContent value="link" className="space-y-4">
            {shareLink ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input value={shareLink} readOnly />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyToClipboard}
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShareLink(null)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Link löschen
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Link-Einstellungen</Label>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="download"
                      checked={allowDownload}
                      onCheckedChange={(checked) => setAllowDownload(checked as boolean)}
                    />
                    <Label htmlFor="download" className="cursor-pointer">
                      Download erlauben
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="comments"
                      checked={allowComments}
                      onCheckedChange={(checked) => setAllowComments(checked as boolean)}
                    />
                    <Label htmlFor="comments" className="cursor-pointer">
                      Kommentare erlauben
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="password"
                      checked={requirePassword}
                      onCheckedChange={(checked) => setRequirePassword(checked as boolean)}
                    />
                    <Label htmlFor="password" className="cursor-pointer">
                      Passwortschutz
                    </Label>
                  </div>

                  {requirePassword && (
                    <Input
                      type="password"
                      placeholder="Passwort eingeben"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Gültig bis</Label>
                  <Select value={expiryDays} onValueChange={setExpiryDays}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Tag</SelectItem>
                      <SelectItem value="7">7 Tage</SelectItem>
                      <SelectItem value="30">30 Tage</SelectItem>
                      <SelectItem value="90">90 Tage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full"
                  onClick={generateShareLink}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Erstelle Link...
                    </>
                  ) : (
                    "Link erstellen"
                  )}
                </Button>
              </>
            )}
          </TabsContent>

          {/* Team Tab */}
          <TabsContent value="team" className="space-y-4">
            <div className="space-y-3">
              <Label>Team-Mitglied einladen</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={collaboratorEmail}
                  onChange={(e) => setCollaboratorEmail(e.target.value)}
                />
                <Select value={collaboratorRole} onValueChange={setCollaboratorRole}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">👁️ Viewer</SelectItem>
                    <SelectItem value="editor">✏️ Editor</SelectItem>
                    <SelectItem value="admin">👑 Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={addCollaborator}
                  disabled={addingCollaborator}
                >
                  {addingCollaborator ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Rollen-Beschreibung</Label>
              <div className="text-sm space-y-1">
                <div>👁️ <strong>Viewer:</strong> Nur ansehen</div>
                <div>✏️ <strong>Editor:</strong> Bearbeiten erlaubt</div>
                <div>👑 <strong>Admin:</strong> Volle Kontrolle</div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}