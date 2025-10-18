import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Instagram, Facebook, Linkedin, Youtube, Twitter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CSVUploadDialog } from "./CSVUploadDialog";
import { PlanLimitDialog } from "./PlanLimitDialog";
import { InstagramTokenDialog } from "./InstagramTokenDialog";
import { TokenStatusBadge } from "./TokenStatusBadge";
import { RefreshCw } from "lucide-react";

const PROVIDERS = [
  { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'bg-pink-500' },
  { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'bg-blue-600' },
  { id: 'tiktok', name: 'TikTok', icon: Upload, color: 'bg-black' },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'bg-blue-700' },
  { id: 'x', name: 'X (Twitter)', icon: Twitter, color: 'bg-black' },
  { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'bg-red-600' }
];

export const ConnectionsTab = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { emit } = useEventEmitter();
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [syncError, setSyncError] = useState<Record<string, boolean>>({});
  const [userPlan, setUserPlan] = useState<string>('free');

  useEffect(() => {
    fetchConnections();
    fetchUserPlan();
    checkTikTokHealth();

    // Check for connection success/error in URL params
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const error = params.get('error');

    if (connected) {
      toast({
        title: t('common.success'),
        description: `Successfully connected to ${connected}`
      });
      fetchConnections(); // Refresh connections
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error) {
      toast({
        title: t('common.error'),
        description: error,
        variant: "destructive"
      });
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const fetchUserPlan = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .single();

      if (data) {
        setUserPlan(data.plan || 'free');
      }
    } catch (error) {
      console.error('Error fetching user plan:', error);
    }
  };

  const checkTikTokHealth = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('tiktok-health');
      
      if (error || !data.configured) {
        console.warn('TikTok not properly configured:', data);
      }
    } catch (error) {
      console.error('TikTok health check failed:', error);
    }
  };

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('social_connections')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      setConnections(data || []);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (providerId: string, providerName: string) => {
    // Check plan limits
    if (userPlan === 'free') {
      setShowUpgradeDialog(true);
      return;
    }

    if (userPlan === 'pro' && connections.length >= 3) {
      toast({
        title: t('common.error'),
        description: 'Pro plan allows up to 3 connections. Disconnect one to add another.',
        variant: "destructive"
      });
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: t('common.error'),
          description: 'Please log in to connect accounts',
          variant: "destructive"
        });
        return;
      }

      // Special handler for Instagram: Use backend function to access app_secrets
      if (providerId === 'instagram') {
        setLoading(true);
        
        try {
          const { data, error } = await supabase.functions.invoke(
            'connect-instagram-performance',
            {
              headers: {
                Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
              }
            }
          );
          
          if (error) throw error;
          
          toast({
            title: t('common.success'),
            description: `${providerName} erfolgreich verbunden!`
          });
          
          await fetchConnections();
        } catch (error: any) {
          toast({
            title: t('common.error'),
            description: error.message || `Failed to connect ${providerName}`,
            variant: 'destructive'
          });
        } finally {
          setLoading(false);
        }
        
        return;
      }

      // Generate CSRF token and timestamp
      const csrf = crypto.randomUUID();
      const timestamp = Date.now();

      // Store state in oauth_states table for verification
      const { error: stateError } = await supabase
        .from('oauth_states')
        .insert({
          user_id: user.id,
          provider: providerId,
          csrf_token: csrf,
          expires_at: new Date(Date.now() + 300000).toISOString() // 5 minutes
        });

      if (stateError) {
        console.error('Failed to store OAuth state:', stateError);
        toast({
          title: t('common.error'),
          description: 'Failed to initiate connection',
          variant: "destructive"
        });
        return;
      }

      // Create state parameter with user ID, provider, CSRF token, and timestamp
      const state = btoa(JSON.stringify({ 
        user_id: user.id,
        provider: providerId,
        csrf,
        timestamp
      }));
      
      // OAuth URLs for each provider
      // Facebook now uses generic oauth-callback without ?provider query param
      const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-callback`;
      
      const oauthUrls: Record<string, string> = {
        instagram: `https://api.instagram.com/oauth/authorize?client_id=${import.meta.env.VITE_META_APP_ID}&redirect_uri=${redirectUri}?provider=instagram&scope=user_profile,user_media&response_type=code&state=${state}`,
        facebook: `https://www.facebook.com/v18.0/dialog/oauth?client_id=${import.meta.env.VITE_META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=pages_read_engagement,pages_manage_metadata,pages_show_list,pages_read_user_content,pages_manage_posts,pages_manage_engagement&state=${encodeURIComponent(state)}`,
        tiktok: `/api/oauth/tiktok/start?user_id=${user.id}`,
        linkedin: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${import.meta.env.VITE_LINKEDIN_CLIENT_ID}&redirect_uri=${redirectUri}?provider=linkedin&scope=r_liteprofile%20r_emailaddress%20w_member_social&state=${state}`,
        x: `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${import.meta.env.VITE_X_CLIENT_ID}&redirect_uri=${redirectUri}?provider=x&scope=tweet.read%20users.read%20offline.access&state=${state}&code_challenge=challenge&code_challenge_method=plain`,
        youtube: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${import.meta.env.VITE_GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}?provider=youtube&response_type=code&scope=https://www.googleapis.com/auth/youtube.readonly&access_type=offline&state=${state}`
      };

      const url = oauthUrls[providerId];
      if (!url) {
        toast({
          title: t('performance.connections.comingSoon'),
          description: `${providerName} ${t('performance.connections.oauthComingSoon')}`,
        });
        return;
      }

      // Open OAuth flow in new window
      window.location.href = url;
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleSync = async (connectionId: string, provider: string) => {
    setLoading(true);
    setSyncError(prev => ({ ...prev, [connectionId]: false }));
    
    try {
      // Use new Instagram Graph API function for Instagram
      if (provider === 'instagram') {
        const { data, error } = await supabase.functions.invoke('instagram-graph-sync');
        
        if (error) throw error;
        
        if (data.success) {
          toast({
            title: t('common.success'),
            description: `Instagram erfolgreich synchronisiert: ${data.mediaSynced} Posts aktualisiert`
          });
          
          await emit({
            event_type: 'performance.synced',
            source: 'connections_tab',
            payload: {
              provider: 'instagram',
              posts_synced: data.mediaSynced,
              followers: data.followers,
              reach_today: data.reachToday
            },
          }, { silent: true });
        } else {
          throw new Error(data.error || 'Sync fehlgeschlagen');
        }
      } else if (provider === 'facebook') {
        // Use new Facebook Page sync function
        const { data, error } = await supabase.functions.invoke('facebook-page-sync');
        
        if (error) throw error;
        
        if (data.success) {
          toast({
            title: t('common.success'),
            description: `Facebook erfolgreich synchronisiert!`
          });
          
          await emit({
            event_type: 'performance.synced',
            source: 'connections_tab',
            payload: {
              provider: 'facebook',
              metrics: data.data?.metrics
            },
          }, { silent: true });
        } else {
          throw new Error(data.error || 'Sync fehlgeschlagen');
        }
      } else if (provider === 'tiktok') {
        // Use TikTok sync function
        const { data, error } = await supabase.functions.invoke('tiktok-sync');
        
        if (error) throw error;
        
        if (data.success) {
          toast({
            title: t('common.success'),
            description: `TikTok erfolgreich synchronisiert: ${data.profile.display_name}`
          });
          
          await emit({
            event_type: 'performance.synced',
            source: 'connections_tab',
            payload: {
              provider: 'tiktok',
              profile: data.profile,
              videos_synced: data.videosSynced
            },
          }, { silent: true });
        } else {
          throw new Error(data.error || 'Sync fehlgeschlagen');
        }
      } else {
        // Use old sync function for other providers
        const { data, error } = await supabase.functions.invoke('sync-social-posts', {
          body: { connectionId, provider }
        });

        if (error) throw error;

        const connection = connections.find(c => c.id === connectionId);
        
        await emit({
          event_type: 'performance.synced',
          source: 'connections_tab',
          payload: {
            provider: connection?.provider || provider,
            account_name: connection?.account_name,
            posts_synced: data?.postsImported || 0,
          },
        }, { silent: true });

        toast({
          title: t('common.success'),
          description: `Imported ${data.postsImported} posts from ${provider}`
        });
      }
      
      fetchConnections();
    } catch (error: any) {
      setSyncError(prev => ({ ...prev, [connectionId]: true }));
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    if (!confirm('Are you sure you want to disconnect this account?')) return;

    try {
      const connection = connections.find(c => c.id === connectionId);
      
      const { error } = await supabase
        .from('social_connections')
        .delete()
        .eq('id', connectionId);

      if (error) throw error;

      await emit({
        event_type: 'performance.account.disconnected',
        source: 'connections_tab',
        payload: {
          provider: connection?.provider,
          account_name: connection?.account_name,
        },
      }, { silent: true });

      toast({
        title: t('common.success'),
        description: 'Account disconnected successfully'
      });

      fetchConnections();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleUploadDraft = async (connectionId: string) => {
    // Open file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/quicktime';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      // Validate file size (max 287MB per TikTok spec)
      if (file.size > 287 * 1024 * 1024) {
        toast({
          title: t('common.error'),
          description: 'Video file too large. Max 287MB.',
          variant: "destructive"
        });
        return;
      }

      // Prompt for title
      const title = prompt('Enter video title (max 150 chars):');
      if (!title || title.length > 150) {
        toast({
          title: t('common.error'),
          description: 'Title is required and must be max 150 characters',
          variant: "destructive"
        });
        return;
      }

      setLoading(true);
      
      try {
        const formData = new FormData();
        formData.append('video', file);
        formData.append('title', title);
        formData.append('description', '');

        const { data, error } = await supabase.functions.invoke('tiktok-upload', {
          body: formData
        });

        if (error) throw error;

        if (data.success) {
          toast({
            title: t('common.success'),
            description: `Video uploaded as draft: ${data.publishId}`
          });
        } else {
          throw new Error(data.error || 'Upload failed');
        }
      } catch (error: any) {
        toast({
          title: t('common.error'),
          description: error.message,
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    input.click();
  };

  const isConnected = (providerId: string) => {
    return connections.some(c => c.provider === providerId);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('performance.connections.title')}</CardTitle>
          <CardDescription>{t('performance.connections.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PROVIDERS.map((provider) => {
              const Icon = provider.icon;
              const connected = isConnected(provider.id);
              const connection = connections.find(c => c.provider === provider.id);

              return (
                <Card key={provider.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${provider.color}`}>
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{provider.name}</h3>
                          {connected && connection && (
                            <p className="text-xs text-muted-foreground">{connection.account_name}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {connected && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Connected</Badge>}
                        {connected && connection && provider.id === 'instagram' && (
                          <TokenStatusBadge 
                            lastSyncAt={connection.last_sync_at} 
                            hasError={syncError[connection.id]} 
                          />
                        )}
                      </div>
                    </div>

                    {connected && connection ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('performance.connections.lastSync')}</span>
                          <span>{connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleDateString() : 'Never'}</span>
                        </div>
                        
                        {provider.id === 'instagram' && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full gap-2"
                            onClick={() => setShowTokenDialog(true)}
                          >
                            <RefreshCw className="h-3 w-3" />
                            Token erneuern
                          </Button>
                        )}

                        {provider.id === 'tiktok' && (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Videos</span>
                              <span>{connection.account_metadata?.video_count || 0}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Follower</span>
                              <span>{connection.account_metadata?.follower_count || 0}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              📊 Analytics metrics (Views, Likes, Comments) will appear once TikTok Business API access is granted.
                            </p>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full gap-2 mt-2"
                              onClick={() => handleUploadDraft(connection.id)}
                            >
                              <Upload className="h-3 w-3" />
                              Upload Draft (Optional)
                            </Button>
                          </>
                        )}
                        
                        <div className="flex gap-2 mt-4">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1" 
                            onClick={() => handleSync(connection.id, provider.id)}
                            disabled={loading}
                          >
                            Sync Now
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => handleDisconnect(connection.id)}
                          >
                            {t('performance.connections.disconnect')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button onClick={() => handleConnect(provider.id, provider.name)} className="w-full">
                        {t('performance.connections.connect')}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* CSV Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('performance.csv.title')}</CardTitle>
          <CardDescription>{t('performance.csv.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setShowCSVUpload(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {t('performance.csv.upload')}
          </Button>
        </CardContent>
      </Card>

      <CSVUploadDialog 
        open={showCSVUpload} 
        onOpenChange={setShowCSVUpload}
        onSuccess={fetchConnections}
      />

      <PlanLimitDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
        feature="API Connections"
      />

      <InstagramTokenDialog
        open={showTokenDialog}
        onOpenChange={setShowTokenDialog}
        onSuccess={fetchConnections}
      />
    </div>
  );
};