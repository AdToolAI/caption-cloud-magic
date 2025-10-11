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

  useEffect(() => {
    fetchConnections();
  }, []);

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

  const handleConnect = (provider: string) => {
    toast({
      title: t('performance.connections.comingSoon'),
      description: `${provider} ${t('performance.connections.oauthComingSoon')}`,
    });
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
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handleConnect(provider.name)}>
                            {t('performance.connections.reconnect')}
                          </Button>
                          <Button variant="destructive" size="sm" className="flex-1">
                            {t('performance.connections.disconnect')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button onClick={() => handleConnect(provider.name)} className="w-full">
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
    </div>
  );
};