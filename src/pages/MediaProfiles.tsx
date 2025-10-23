import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Settings, Plus, Copy, Star } from 'lucide-react';
import { SEO } from '@/components/SEO';

interface MediaProfile {
  id: string;
  name: string;
  provider: string;
  account_id?: string;
  config: any;
  is_default: boolean;
  created_at: string;
}

export default function MediaProfiles() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<MediaProfile[]>([]);
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [editingProfile, setEditingProfile] = useState<MediaProfile | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfiles();
    }
  }, [user]);

  const loadProfiles = async () => {
    if (!user) return;

    let query = supabase
      .from('media_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (filterProvider !== 'all') {
      query = query.eq('provider', filterProvider);
    }

    const { data, error } = await query;

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Profile konnten nicht geladen werden.',
        variant: 'destructive'
      });
      return;
    }

    setProfiles(data || []);
  };

  const handleDuplicate = async (profile: MediaProfile) => {
    if (!user) return;

    const { error } = await supabase
      .from('media_profiles')
      .insert({
        user_id: user.id,
        provider: profile.provider,
        name: `${profile.name} (Kopie)`,
        config: profile.config,
        is_default: false
      });

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

  const handleSetDefault = async (profileId: string, provider: string) => {
    if (!user) return;

    // Unset all defaults for this provider first
    await supabase
      .from('media_profiles')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('provider', provider);

    // Set new default
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
    if (!user) return;

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

    loadProfiles();
  };

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

        {/* Filter */}
        <div className="mb-6">
          <Label>Plattform filtern</Label>
          <Select value={filterProvider} onValueChange={(v) => {
            setFilterProvider(v);
            setTimeout(loadProfiles, 50);
          }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kanäle</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="x">X (Twitter)</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Profile List */}
        <div className="grid gap-4">
          {profiles.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Settings className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">
                  Noch keine Profile vorhanden.
                </p>
                <Button onClick={() => {
                  setEditingProfile(null);
                  setShowEditor(true);
                }}>
                  Erstes Profil erstellen
                </Button>
              </CardContent>
            </Card>
          ) : (
            profiles.map((profile) => (
              <Card key={profile.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">{profile.name}</CardTitle>
                    <Badge variant="outline">{profile.provider}</Badge>
                    {profile.is_default && (
                      <Badge variant="secondary" className="gap-1">
                        <Star className="h-3 w-3" />
                        Standard
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Format: {profile.config.aspect} • {profile.config.width}x{profile.config.height}
                      {profile.config.video && ` • ${profile.config.video.bitrateKb} kb/s`}
                    </p>

                    <div className="flex gap-2 pt-2">
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
                          onClick={() => handleSetDefault(profile.id, profile.provider)}
                        >
                          <Star className="h-3 w-3 mr-1" />
                          Als Standard
                        </Button>
                      )}
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => handleDelete(profile.id)}
                      >
                        Löschen
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Simple Editor Dialog */}
        <ProfileEditor
          profile={editingProfile}
          open={showEditor}
          onOpenChange={setShowEditor}
          onSave={() => {
            loadProfiles();
            setShowEditor(false);
          }}
        />
      </div>
    </>
  );
}

// Simplified Profile Editor Component
function ProfileEditor({
  profile,
  open,
  onOpenChange,
  onSave
}: {
  profile: MediaProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState(profile?.name || '');
  const [provider, setProvider] = useState(profile?.provider || 'instagram');
  const [configJson, setConfigJson] = useState(JSON.stringify(profile?.config || {
    aspect: '1:1',
    width: 1080,
    height: 1080,
    fitMode: 'smart',
    sizeLimitMb: 200
  }, null, 2));

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setProvider(profile.provider);
      setConfigJson(JSON.stringify(profile.config, null, 2));
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;

    let config;
    try {
      config = JSON.parse(configJson);
    } catch (e) {
      toast({
        title: 'Fehler',
        description: 'Ungültiges JSON-Format.',
        variant: 'destructive'
      });
      return;
    }

    if (profile) {
      // Update
      const { error } = await supabase
        .from('media_profiles')
        .update({ name, provider, config })
        .eq('id', profile.id);

      if (error) {
        toast({
          title: 'Fehler',
          description: 'Profil konnte nicht aktualisiert werden.',
          variant: 'destructive'
        });
        return;
      }
    } else {
      // Create
      const { error } = await supabase
        .from('media_profiles')
        .insert({
          user_id: user.id,
          name,
          provider,
          config,
          is_default: false
        });

      if (error) {
        toast({
          title: 'Fehler',
          description: 'Profil konnte nicht erstellt werden.',
          variant: 'destructive'
        });
        return;
      }
    }

    toast({
      title: 'Erfolg',
      description: 'Profil wurde gespeichert.'
    });

    onSave();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {profile ? 'Profil bearbeiten' : 'Neues Profil erstellen'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Instagram Reels 9:16"
            />
          </div>

          <div>
            <Label>Plattform</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="x">X (Twitter)</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Konfiguration (JSON)</Label>
            <Textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              JSON-Format mit aspect, width, height, fitMode, video, image, watermark, sizeLimitMb
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
