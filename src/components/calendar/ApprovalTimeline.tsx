import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

interface ApprovalTimelineProps {
  event_id: string;
}

export function ApprovalTimeline({ event_id }: ApprovalTimelineProps) {
  const { data: approvals, isLoading } = useQuery({
    queryKey: ['approvals', event_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_approvals')
        .select('*')
        .eq('event_id', event_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Lade Approvals...</div>;
  }

  if (!approvals || approvals.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            Keine Approval-Anfragen
          </p>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="default" className="bg-green-500">Genehmigt</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Abgelehnt</Badge>;
      default:
        return <Badge variant="secondary">Ausstehend</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Approval Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {approvals.map((approval, index) => (
            <div key={approval.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                {getStatusIcon(approval.status)}
                {index < approvals.length - 1 && (
                  <div className="w-px h-full bg-border mt-2" />
                )}
              </div>

              <div className="flex-1 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {approval.approver_email}
                    </span>
                    {getStatusBadge(approval.status)}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(approval.created_at), {
                      addSuffix: true,
                      locale: de,
                    })}
                  </span>
                </div>

                {approval.approver_role && (
                  <p className="text-xs text-muted-foreground mb-1">
                    Rolle: {approval.approver_role}
                  </p>
                )}

                {approval.comment && (
                  <div className="bg-muted p-2 rounded text-sm mt-2">
                    <p className="text-muted-foreground">{approval.comment}</p>
                  </div>
                )}

                {approval.stage && (
                  <Badge variant="outline" className="mt-2">
                    Stage: {approval.stage}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
