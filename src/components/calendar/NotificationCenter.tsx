import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useCalendarNotifications } from '@/hooks/useCalendarNotifications';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const { notifications, markAsRead, markAllAsRead, isLoading } = useCalendarNotifications();
  const navigate = useNavigate();

  const handleNotificationClick = (notification: any) => {
    markAsRead(notification.id);
    
    if (notification.event_id) {
      navigate(`/calendar?event=${notification.event_id}`);
      onClose();
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'deadline':
        return '⏰';
      case 'render_complete':
        return '🎬';
      case 'approval_request':
        return '✋';
      case 'approval_approved':
        return '✅';
      case 'approval_rejected':
        return '🚫';
      case 'recurring_event_created':
        return '🔄';
      default:
        return '🔔';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Benachrichtigungen
            </span>
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsRead()}
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                Alle lesen
              </Button>
            )}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-8rem)] mt-4">
          <div className="space-y-2">
            {isLoading && (
              <div className="text-center py-8 text-muted-foreground">
                Lade Benachrichtigungen...
              </div>
            )}

            {!isLoading && notifications.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Keine Benachrichtigungen</p>
              </div>
            )}

            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  notification.read
                    ? 'bg-background hover:bg-muted/50'
                    : 'bg-primary/5 border-primary/20 hover:bg-primary/10'
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{getTypeIcon(notification.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="font-medium text-sm">{notification.title}</h4>
                      {!notification.read && (
                        <Badge variant="default" className="shrink-0">Neu</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), {
                        addSuffix: true,
                        locale: de,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
