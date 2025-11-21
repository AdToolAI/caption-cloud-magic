import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { usePlatformCredentials, Platform } from '@/hooks/usePlatformCredentials';
import { Instagram, Music, Linkedin, Youtube, Facebook, Twitter, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const platformConfig = [
  {
    id: 'instagram' as Platform,
    name: 'Instagram',
    icon: Instagram,
    color: 'text-pink-500',
    setupUrl: 'https://developers.facebook.com/apps',
    description: 'Verbinde deinen Instagram Business Account über Meta Developer.',
  },
  {
    id: 'tiktok' as Platform,
    name: 'TikTok',
    icon: Music,
    color: 'text-black dark:text-white',
    setupUrl: 'https://developers.tiktok.com',
    description: 'Erstelle eine TikTok Developer App für API-Zugriff.',
  },
  {
    id: 'linkedin' as Platform,
    name: 'LinkedIn',
    icon: Linkedin,
    color: 'text-blue-600',
    setupUrl: 'https://www.linkedin.com/developers',
    description: 'Richte LinkedIn OAuth 2.0 für deine Organization ein.',
  },
  {
    id: 'youtube' as Platform,
    name: 'YouTube',
    icon: Youtube,
    color: 'text-red-600',
    setupUrl: 'https://console.cloud.google.com',
    description: 'Aktiviere YouTube Data API v3 in der Google Cloud Console.',
  },
  {
    id: 'facebook' as Platform,
    name: 'Facebook',
    icon: Facebook,
    color: 'text-blue-500',
    setupUrl: 'https://developers.facebook.com/apps',
    description: 'Verbinde deine Facebook Page über Meta Developer.',
  },
  {
    id: 'x' as Platform,
    name: 'X (Twitter)',
    icon: Twitter,
    color: 'text-gray-900 dark:text-white',
    setupUrl: 'https://developer.twitter.com',
    description: 'Erstelle eine X Developer App für API-Zugriff.',
  },
];

export default function SocialMediaSettings() {
  const { credentials, loading, isConnected, updateConnectionStatus } = usePlatformCredentials();
  const [updating, setUpdating] = useState<Platform | null>(null);

  const handleToggleConnection = async (platform: Platform) => {
    setUpdating(platform);
    const currentStatus = isConnected(platform);
    await updateConnectionStatus(platform, !currentStatus);
    setUpdating(null);
  };

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Social Media Verbindungen</h1>
        <p className="text-muted-foreground">
          Verwalte deine Verbindungen zu verschiedenen Social Media Plattformen
        </p>
      </div>

      <Alert className="mb-6">
        <AlertDescription>
          Um Social Media Publishing zu nutzen, müssen die entsprechenden API-Tokens als Secrets konfiguriert werden.
          Die Token-Namen sind: INSTAGRAM_ACCESS_TOKEN, TIKTOK_ACCESS_TOKEN, LINKEDIN_ACCESS_TOKEN, YOUTUBE_ACCESS_TOKEN, etc.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Lade Verbindungen...</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {platformConfig.map(platform => {
            const Icon = platform.icon;
            const connected = isConnected(platform.id);
            const isUpdating = updating === platform.id;

            return (
              <Card key={platform.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`p-3 rounded-lg bg-background border ${platform.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">{platform.name}</h3>
                        {connected ? (
                          <div className="flex items-center gap-1 text-sm text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span>Verbunden</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <XCircle className="h-4 w-4" />
                            <span>Nicht verbunden</span>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        {platform.description}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(platform.setupUrl, '_blank')}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Developer Portal
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`toggle-${platform.id}`} className="text-sm">
                      {connected ? 'Aktiv' : 'Inaktiv'}
                    </Label>
                    <Switch
                      id={`toggle-${platform.id}`}
                      checked={connected}
                      onCheckedChange={() => handleToggleConnection(platform.id)}
                      disabled={isUpdating}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-6 mt-6">
        <h3 className="text-lg font-semibold mb-4">Setup-Anleitung</h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>Schritt 1:</strong> Erstelle Developer Apps auf den jeweiligen Plattformen
          </p>
          <p>
            <strong>Schritt 2:</strong> Generiere Access Tokens mit den benötigten Permissions
          </p>
          <p>
            <strong>Schritt 3:</strong> Füge die Tokens als Secrets hinzu (z.B. INSTAGRAM_ACCESS_TOKEN)
          </p>
          <p>
            <strong>Schritt 4:</strong> Aktiviere die Verbindung hier im Dashboard
          </p>
        </div>
      </Card>
    </div>
  );
}
