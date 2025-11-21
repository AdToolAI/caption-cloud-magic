import { useTemplateCollaboration } from '@/hooks/useTemplateCollaboration';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users } from 'lucide-react';

interface ActiveEditorsIndicatorProps {
  templateId: string;
}

export const ActiveEditorsIndicator = ({ templateId }: ActiveEditorsIndicatorProps) => {
  const { activeSessions } = useTemplateCollaboration(templateId);

  if (!activeSessions || activeSessions.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <div className="flex -space-x-2">
          {activeSessions.slice(0, 3).map((session) => (
            <Tooltip key={session.id}>
              <TooltipTrigger>
                <Avatar className="h-8 w-8 border-2 border-background">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {session.user_id.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Benutzer: {session.user_id.slice(0, 8)}</p>
              </TooltipContent>
            </Tooltip>
          ))}
          {activeSessions.length > 3 && (
            <Avatar className="h-8 w-8 border-2 border-background">
              <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                +{activeSessions.length - 3}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {activeSessions.length} {activeSessions.length === 1 ? 'Benutzer' : 'Benutzer'} aktiv
        </span>
      </div>
    </TooltipProvider>
  );
};
