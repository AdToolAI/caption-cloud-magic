import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Monitor, 
  Smartphone, 
  Tablet, 
  Loader2, 
  LogOut, 
  MapPin,
  Clock,
  CheckCircle
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

interface Session {
  id: string;
  device_info: string | null;
  browser: string | null;
  os: string | null;
  location: string | null;
  created_at: string;
  last_active: string;
  is_current: boolean;
}

export const ActiveSessionsList = () => {
  const { toast } = useToast();
  const { signOut } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [terminatingAll, setTerminatingAll] = useState(false);

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .order('last_active', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const getDeviceIcon = (deviceInfo: string | null, os: string | null) => {
    const info = (deviceInfo || os || '').toLowerCase();
    if (info.includes('mobile') || info.includes('android') || info.includes('iphone')) {
      return <Smartphone className="h-5 w-5" />;
    }
    if (info.includes('tablet') || info.includes('ipad')) {
      return <Tablet className="h-5 w-5" />;
    }
    return <Monitor className="h-5 w-5" />;
  };

  const terminateSession = async (sessionId: string) => {
    setTerminatingId(sessionId);
    try {
      const { error } = await supabase
        .from('user_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      setSessions(prev => prev.filter(s => s.id !== sessionId));
      toast({
        title: "Sitzung beendet",
        description: "Die Sitzung wurde erfolgreich beendet"
      });
    } catch (err) {
      console.error('Error terminating session:', err);
      toast({
        title: "Fehler",
        description: "Sitzung konnte nicht beendet werden",
        variant: "destructive"
      });
    } finally {
      setTerminatingId(null);
    }
  };

  const terminateAllOthers = async () => {
    setTerminatingAll(true);
    try {
      // Delete all sessions except current
      const otherSessions = sessions.filter(s => !s.is_current);
      
      for (const session of otherSessions) {
        await supabase
          .from('user_sessions')
          .delete()
          .eq('id', session.id);
      }

      // Sign out from all devices using Supabase
      await supabase.auth.signOut({ scope: 'others' });

      setSessions(prev => prev.filter(s => s.is_current));
      toast({
        title: "Alle anderen Sitzungen beendet",
        description: "Du bist jetzt nur noch auf diesem Gerät angemeldet"
      });
    } catch (err) {
      console.error('Error terminating all sessions:', err);
      toast({
        title: "Fehler",
        description: "Einige Sitzungen konnten nicht beendet werden",
        variant: "destructive"
      });
    } finally {
      setTerminatingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>Keine aktiven Sitzungen gefunden</p>
      </div>
    );
  }

  const otherSessionsCount = sessions.filter(s => !s.is_current).length;

  return (
    <div className="space-y-4">
      {sessions.map((session) => (
        <Card 
          key={session.id} 
          className={`${session.is_current ? 'border-primary/50 bg-primary/5' : ''}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  {getDeviceIcon(session.device_info, session.os)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {session.browser || 'Unbekannter Browser'}
                      {session.os ? ` auf ${session.os}` : ''}
                    </span>
                    {session.is_current && (
                      <span className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        <CheckCircle className="h-3 w-3" />
                        Aktuelle Sitzung
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {session.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {session.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(session.last_active), "dd. MMM yyyy, HH:mm", { locale: de })}
                    </span>
                  </div>
                </div>
              </div>
              
              {!session.is_current && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => terminateSession(session.id)}
                  disabled={terminatingId === session.id}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  {terminatingId === session.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {otherSessionsCount > 0 && (
        <Button
          variant="outline"
          onClick={terminateAllOthers}
          disabled={terminatingAll}
          className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
        >
          {terminatingAll ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <LogOut className="h-4 w-4 mr-2" />
          )}
          Alle anderen Sitzungen beenden ({otherSessionsCount})
        </Button>
      )}
    </div>
  );
};
