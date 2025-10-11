import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEventNotifications } from '@/hooks/useEventNotifications';
import { useTranslation } from '@/hooks/useTranslation';
import { getEventTranslation } from '@/lib/eventTranslations';
import { formatDistanceToNow } from 'date-fns';
import { de, enUS, es } from 'date-fns/locale';

export function NotificationBell() {
  const { language } = useTranslation();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useEventNotifications(language);

  const getLocale = () => {
    switch (language) {
      case 'de': return de;
      case 'es': return es;
      default: return enUS;
    }
  };

  const getEventLabel = (eventType: string) => {
    const keyMap: Record<string, string> = {
      'goal.completed': 'goalCompleted',
      'comment.imported': 'commentsImported',
      'performance.synced': 'performanceSynced',
    };
    return getEventTranslation(keyMap[eventType] || eventType, language);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-primary hover:bg-transparent"
              onClick={markAllAsRead}
            >
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="flex flex-col items-start p-3 cursor-pointer"
                onClick={() => markAsRead(notification.id)}
              >
                <div className="flex items-start justify-between w-full">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {getEventLabel(notification.event_type)}
                    </p>
                    {notification.payload_json?.platform && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Platform: {notification.payload_json.platform}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.occurred_at), {
                        addSuffix: true,
                        locale: getLocale(),
                      })}
                    </p>
                  </div>
                  {!notification.read && (
                    <div className="h-2 w-2 rounded-full bg-primary ml-2 mt-1" />
                  )}
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
