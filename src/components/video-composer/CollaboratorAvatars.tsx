import { useMemo } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { PresenceUser } from '@/hooks/useComposerCollaboration';

interface Props {
  peers: PresenceUser[];
  max?: number;
}

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function CollaboratorAvatars({ peers, max = 5 }: Props) {
  const visible = useMemo(() => peers.slice(0, max), [peers, max]);
  const overflow = Math.max(0, peers.length - max);

  if (peers.length === 0) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center -space-x-2">
        {visible.map((p) => (
          <Tooltip key={p.user_id}>
            <TooltipTrigger asChild>
              <Avatar
                className="h-8 w-8 ring-2 ring-background transition-transform hover:scale-110"
                style={{ borderColor: p.color, boxShadow: `0 0 0 2px ${p.color}` }}
              >
                <AvatarFallback
                  className="text-xs font-medium"
                  style={{ background: p.color, color: '#0a0a0a' }}
                >
                  {initials(p.name)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <span className="text-xs">{p.name} {p.active_scene_id ? '· editing' : '· viewing'}</span>
            </TooltipContent>
          </Tooltip>
        ))}
        {overflow > 0 && (
          <Avatar className="h-8 w-8 ring-2 ring-background">
            <AvatarFallback className="text-xs bg-muted text-muted-foreground">+{overflow}</AvatarFallback>
          </Avatar>
        )}
      </div>
    </TooltipProvider>
  );
}
