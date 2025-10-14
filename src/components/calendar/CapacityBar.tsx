import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface CapacityBarProps {
  workspaceId: string;
  weekStart: Date;
}

interface UserCapacity {
  user_id: string;
  username: string;
  available_minutes: number;
  planned_minutes: number;
  utilization: number;
}

export function CapacityBar({ workspaceId, weekStart }: CapacityBarProps) {
  const { t } = useTranslation();
  const [capacities, setCapacities] = useState<UserCapacity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCapacity();
  }, [workspaceId, weekStart]);

  const fetchCapacity = async () => {
    setLoading(true);

    // Get week end date
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Fetch all events for the week with assignees
    const { data: events, error: eventsError } = await supabase
      .from("calendar_events")
      .select("assignees, eta_minutes")
      .eq("workspace_id", workspaceId)
      .gte("start_at", weekStart.toISOString())
      .lt("start_at", weekEnd.toISOString());

    if (eventsError) {
      console.error("Failed to fetch events:", eventsError);
      setLoading(false);
      return;
    }

    // Calculate planned minutes per user
    const userMinutes: Record<string, number> = {};
    
    events?.forEach((event) => {
      const assignees = event.assignees || [];
      const minutes = event.eta_minutes || 0;
      const perUser = assignees.length > 0 ? minutes / assignees.length : 0;

      assignees.forEach((userId: string) => {
        userMinutes[userId] = (userMinutes[userId] || 0) + perUser;
      });
    });

    // Fetch workspace members with their capacity
    const { data: members, error: membersError } = await supabase
      .from("workspace_members")
      .select(`
        user_id,
        profiles:user_id (
          email
        )
      `)
      .eq("workspace_id", workspaceId);

    if (membersError) {
      console.error("Failed to fetch members:", membersError);
      setLoading(false);
      return;
    }

    // Fetch user capacity settings
    const { data: capacitySettings } = await supabase
      .from("user_capacity")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("week_start", weekStart.toISOString().split('T')[0]);

    const capacityMap = new Map(
      capacitySettings?.map(c => [c.user_id, c.available_minutes]) || []
    );

    // Build capacity data
    const capacityData: UserCapacity[] = members?.map((member: any) => {
      const userId = member.user_id;
      const email = member.profiles?.email || "Unknown";
      const username = email.split('@')[0];
      const available = capacityMap.get(userId) || 2400; // 40h default
      const planned = userMinutes[userId] || 0;
      const utilization = available > 0 ? (planned / available) * 100 : 0;

      return {
        user_id: userId,
        username,
        available_minutes: available,
        planned_minutes: planned,
        utilization
      };
    }) || [];

    setCapacities(capacityData);
    setLoading(false);
  };

  const formatHours = (minutes: number) => {
    const hours = Math.round(minutes / 60 * 10) / 10;
    return `${hours}h`;
  };

  const getUtilizationBadge = (utilization: number) => {
    if (utilization > 100) {
      return (
        <Badge variant="destructive" className="ml-2">
          <AlertCircle className="w-3 h-3 mr-1" />
          Overbooked
        </Badge>
      );
    } else if (utilization > 80) {
      return (
        <Badge variant="secondary" className="ml-2">
          <Clock className="w-3 h-3 mr-1" />
          Near Capacity
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="ml-2">
          <CheckCircle className="w-3 h-3 mr-1" />
          Available
        </Badge>
      );
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team Capacity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Capacity</CardTitle>
        <p className="text-sm text-muted-foreground">
          Week starting {weekStart.toLocaleDateString()}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {capacities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No team members found
          </p>
        ) : (
          capacities.map((capacity) => (
            <div key={capacity.user_id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{capacity.username}</span>
                  {getUtilizationBadge(capacity.utilization)}
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatHours(capacity.planned_minutes)} / {formatHours(capacity.available_minutes)}
                </span>
              </div>
              <Progress 
                value={Math.min(capacity.utilization, 100)} 
                className={capacity.utilization > 100 ? "bg-red-100" : ""}
              />
              <p className="text-xs text-muted-foreground">
                {Math.round(capacity.utilization)}% utilized
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
