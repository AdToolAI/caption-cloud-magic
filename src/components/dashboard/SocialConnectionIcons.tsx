import { useNavigate } from 'react-router-dom';
import { Instagram, Music, Linkedin, Youtube, Facebook, Twitter } from 'lucide-react';
import { usePlatformCredentials, Platform } from '@/hooks/usePlatformCredentials';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const platforms: { id: Platform; name: string; icon: typeof Instagram; color: string }[] = [
  { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'text-blue-500' },
  { id: 'tiktok', name: 'TikTok', icon: Music, color: 'text-foreground' },
  { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'text-pink-500' },
  { id: 'x', name: 'X', icon: Twitter, color: 'text-foreground' },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'text-blue-600' },
  { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'text-red-600' },
];

export function SocialConnectionIcons() {
  const { isConnected, loading } = usePlatformCredentials();
  const navigate = useNavigate();

  const connectedCount = platforms.filter(p => isConnected(p.id)).length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1.5">
        {platforms.map(({ id, name, icon: Icon, color }) => {
          const connected = isConnected(id);
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate(`/integrations?connect=${id}`)}
                  className="relative p-1 rounded-md hover:bg-muted transition-colors"
                >
                  <Icon
                    className={`h-4 w-4 transition-opacity ${connected ? color : 'text-muted-foreground/40'}`}
                  />
                  {connected && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 border border-card" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {name} – {connected ? 'Verbunden' : 'Nicht verbunden'}
              </TooltipContent>
            </Tooltip>
          );
        })}
        <span className="text-xs text-muted-foreground ml-1">
          {loading ? '…' : `${connectedCount} verbunden`}
        </span>
      </div>
    </TooltipProvider>
  );
}
