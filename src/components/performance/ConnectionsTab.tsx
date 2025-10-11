import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
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
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [userPlan, setUserPlan] = useState<string>('free');

  useEffect(() => {
    fetchConnections();
    fetchUserPlan();
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

      // Create state parameter with user ID
      const state = btoa(JSON.stringify({ user_id: user.id }));
      
      // OAuth URLs for each provider
      const oauthUrls: Record<string, string> = {
        instagram: `https://api.instagram.com/oauth/authorize?client_id=${import.meta.env.VITE_META_APP_ID}&redirect_uri=${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-callback?provider=instagram&scope=user_profile,user_media&response_type=code&state=${state}`,
        facebook: `https://www.facebook.com/v18.0/dialog/oauth?client_id=${import.meta.env.VITE_META_APP_ID}&redirect_uri=${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-callback?provider=facebook&scope=pages_read_engagement,pages_show_list&response_type=code&state=${state}`,
        tiktok: `https://www.tiktok.com/auth/authorize/?client_key=${import.meta.env.VITE_TIKTOK_CLIENT_KEY}&response_type=code&scope=user.info.basic,video.list&redirect_uri=${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-callback?provider=tiktok&state=${state}`,
        linkedin: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${import.meta.env.VITE_LINKEDIN_CLIENT_ID}&redirect_uri=${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-callback?provider=linkedin&scope=r_liteprofile%20r_emailaddress%20w_member_social&state=${state}`,
        x: `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${import.meta.env.VITE_X_CLIENT_ID}&redirect_uri=${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-callback?provider=x&scope=tweet.read%20users.read%20offline.access&state=${state}&code_challenge=challenge&code_challenge_method=plain`,
        youtube: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${import.meta.env.VITE_GOOGLE_CLIENT_ID}&redirect_uri=${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-callback?provider=youtube&response_type=code&scope=https://www.googleapis.com/auth/youtube.readonly&access_type=offline&state=${state}`
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
    try {
      const { data, error } = await supabase.functions.invoke('sync-social-posts', {
        body: { connectionId, provider }
      });

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: `Imported ${data.postsImported} posts from ${provider}`
      });

      fetchConnections();
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

  const handleDisconnect = async (connectionId: string) => {
    if (!confirm('Are you sure you want to disconnect this account?')) return;

    try {
      const { error } = await supabase
        .from('social_connections')
        .delete()
        .eq('id', connectionId);

      if (error) throw error;

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
                      {connected && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Connected</Badge>}
                    </div>

                    {connected && connection ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('performance.connections.lastSync')}</span>
                          <span>{connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleDateString() : 'Never'}</span>
                        </div>
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
    </div>
  );
};