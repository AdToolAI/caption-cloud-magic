import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Settings, Plus, Copy, Star, Download, Trash2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { ProfileEditorDialog } from '@/components/media-profiles/ProfileEditorDialog';
import { MediaProfile, Platform } from '@/lib/mediaProfileSchema';
import { EmptyState } from '@/components/ui/EmptyState';
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

export default function MediaProfiles() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<MediaProfile[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [editingProfile, setEditingProfile] = useState<MediaProfile | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; profileId: string | null }>({
    open: false,
    profileId: null
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadWorkspace();
    }
  }, [user]);

  useEffect(() => {
    if (workspaceId) {
      loadProfiles();
    }
  }, [workspaceId, filterPlatform]);

  const loadWorkspace = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1)
      .single();

    if (error || !data) {
      toast({
        title: 'Fehler',
        description: 'Workspace konnte nicht geladen werden.',
        variant: 'destructive'
      });
      return;
    }

    setWorkspaceId(data.id);
  };

  const loadProfiles = async () => {
    if (!workspaceId) return;

    setIsLoading(true);
    let query = supabase
      .from('media_profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (filterPlatform !== 'all') {
      query = query.eq('platform', filterPlatform);
    }

    const { data, error } = await query;

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Profile konnten nicht geladen werden.',
        variant: 'destructive'
      });
      setIsLoading(false);
      return;
    }

    setProfiles((data as any[]) || []);
    setIsLoading(false);
  };

  const handleSaveProfile = async (profileData: Omit<MediaProfile, 'id' | 'created_at' | 'updated_at'>) => {
    if (editingProfile) {
      const { error } = await supabase
        .from('media_profiles')
        .update({
          name: profileData.name,
          platform: profileData.platform,
          type: profileData.type,
          config: profileData.config as any,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingProfile.id);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('media_profiles')
        .insert([{
          workspace_id: profileData.workspace_id,
          name: profileData.name,
          platform: profileData.platform,
          type: profileData.type,
          config: profileData.config as any,
          is_default: false,
          user_id: user!.id
        }]);

      if (error) throw error;
    }

    loadProfiles();
  };

  const handleDuplicate = async (profile: MediaProfile) => {
    if (!workspaceId) return;

    const { error } = await supabase
      .from('media_profiles')
      .insert([{
        workspace_id: workspaceId,
        platform: profile.platform,
        type: profile.type,
        name: `${profile.name} (Kopie)`,
        config: profile.config as any,
        is_default: false,
        user_id: user!.id
      }]);

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Profil konnte nicht dupliziert werden.',
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: 'Profil dupliziert',
      description: 'Das Profil wurde erfolgreich kopiert.'
    });

    loadProfiles();
  };

  const handleSetDefault = async (profileId: string, platform: string) => {
    if (!workspaceId) return;

    await supabase
      .from('media_profiles')
      .update({ is_default: false })
      .eq('workspace_id', workspaceId)
      .eq('platform', platform);

    const { error } = await supabase
      .from('media_profiles')
      .update({ is_default: true })
      .eq('id', profileId);

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Standard konnte nicht gesetzt werden.',
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: 'Standard gesetzt',
      description: 'Das Profil ist jetzt der Standard für diesen Kanal.'
    });

    loadProfiles();
  };

  const handleDelete = async (profileId: string) => {
    const { error } = await supabase
      .from('media_profiles')
      .delete()
      .eq('id', profileId);

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Profil konnte nicht gelöscht werden.',
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: 'Profil gelöscht',
      description: 'Das Profil wurde erfolgreich gelöscht.'
    });

    setDeleteDialog({ open: false, profileId: null });
    loadProfiles();
  };

  const handleExport = (profile: MediaProfile) => {
    const exportData = {
      name: profile.name,
      platform: profile.platform,
      type: profile.type,
      config: profile.config
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Export erfolgreich',
      description: 'Profil wurde als JSON exportiert.'
    });
  };

  if (!workspaceId) {
    return (
      <div className="container max-w-6xl py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <Settings className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Workspace wird geladen...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <SEO
        title="Medien-Profile"
        description="Verwalte deine Medien-Profile für verschiedene Social-Media-Kanäle."
      />

      <div className="container max-w-6xl py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Medien-Profile</h1>
            <p className="text-muted-foreground">
              Verwalte Formate und Einstellungen für verschiedene Plattformen.
            </p>
          </div>

          <Button onClick={() => {
            setEditingProfile(null);
            setShowEditor(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Neues Profil
          </Button>
        </div>

        <div className="mb-6">
          <Label>Plattform filtern</Label>
          <Select value={filterPlatform} onValueChange={setFilterPlatform}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Plattformen</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="x">X (Twitter)</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Lade Profile...</p>
            </CardContent>
          </Card>
        ) : profiles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Settings className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">
                {filterPlatform === 'all' 
                  ? 'Noch keine Profile vorhanden.'
                  : `Keine Profile für ${filterPlatform} gefunden.`
                }
              </p>
              <Button onClick={() => {
                setEditingProfile(null);
                setShowEditor(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Erstes Profil erstellen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {profiles.map((profile) => (
              <Card key={profile.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">{profile.name}</CardTitle>
                    <Badge variant="outline">{profile.platform}</Badge>
                    <Badge variant="secondary">{profile.type}</Badge>
                    {profile.is_default && (
                      <Badge variant="default" className="gap-1">
                        <Star className="h-3 w-3 fill-current" />
                        Standard
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      <strong>Format:</strong> {profile.config.aspect} • {profile.config.width}×{profile.config.height}px
                      {' • '}
                      <strong>Fit:</strong> {profile.config.fitMode}
                      {' • '}
                      <strong>Limit:</strong> {profile.config.sizeLimitMb}MB
                      {profile.config.video && (
                        <>
                          {' • '}
                          <strong>Video:</strong> {profile.config.video.targetFps || 30}fps @ {profile.config.video.targetBitrateMbps || 'auto'} Mbps
                        </>
                      )}
                    </p>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button size="sm" onClick={() => {
                        setEditingProfile(profile);
                        setShowEditor(true);
                      }}>
                        Bearbeiten
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleDuplicate(profile)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Duplizieren
                      </Button>
                      {!profile.is_default && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => handleSetDefault(profile.id!, profile.platform)}
                        >
                          <Star className="h-3 w-3 mr-1" />
                          Als Standard
                        </Button>
                      )}
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => handleExport(profile)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Export
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => setDeleteDialog({ open: true, profileId: profile.id! })}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Löschen
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <ProfileEditorDialog
          profile={editingProfile}
          workspaceId={workspaceId}
          open={showEditor}
          onOpenChange={setShowEditor}
          onSave={handleSaveProfile}
        />

        <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Profil wirklich löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Diese Aktion kann nicht rückgängig gemacht werden. Das Profil wird dauerhaft gelöscht.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteDialog.profileId && handleDelete(deleteDialog.profileId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}

