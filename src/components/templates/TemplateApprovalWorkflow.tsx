import { useState } from 'react';
import { useTemplateCollaboration } from '@/hooks/useTemplateCollaboration';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface TemplateApprovalWorkflowProps {
  templateId: string;
}

export const TemplateApprovalWorkflow = ({ templateId }: TemplateApprovalWorkflowProps) => {
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const { approvals, updateApproval, isUpdatingApproval } = useTemplateCollaboration(templateId);

  const handleApproval = (approvalId: string, status: 'approved' | 'rejected') => {
    updateApproval({
      approvalId,
      status,
      comment: comment.trim() || undefined,
    });
    setSelectedApproval(null);
    setComment('');
  };

  const getStatusBadge = (status: string) => {
    const config = {
      pending: { label: 'Ausstehend', icon: Clock, variant: 'secondary' as const },
      approved: { label: 'Genehmigt', icon: CheckCircle2, variant: 'default' as const },
      rejected: { label: 'Abgelehnt', icon: XCircle, variant: 'destructive' as const },
    };

    const { label, icon: Icon, variant } = config[status as keyof typeof config] || config.pending;

    return (
      <Badge variant={variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </Badge>
    );
  };

  return (
    <Card className="p-6">
      <h3 className="font-semibold text-foreground mb-4">Freigabe-Workflow</h3>

      <div className="space-y-4">
        {approvals?.map((approval) => (
          <div key={approval.id} className="p-4 bg-muted rounded-lg">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Eingereicht von: {approval.submitted_by.slice(0, 8)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(approval.submitted_at), {
                    addSuffix: true,
                    locale: de,
                  })}
                </p>
              </div>
              {getStatusBadge(approval.status)}
            </div>

            {approval.comment && (
              <p className="text-sm text-muted-foreground mb-3 p-2 bg-background rounded">
                {approval.comment}
              </p>
            )}

            {approval.status === 'pending' && selectedApproval === approval.id && (
              <div className="space-y-3 mt-3">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Kommentar zur Freigabe..."
                  className="min-h-[80px]"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleApproval(approval.id, 'approved')}
                    disabled={isUpdatingApproval}
                    className="flex-1"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Genehmigen
                  </Button>
                  <Button
                    onClick={() => handleApproval(approval.id, 'rejected')}
                    disabled={isUpdatingApproval}
                    variant="destructive"
                    className="flex-1"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Ablehnen
                  </Button>
                </div>
              </div>
            )}

            {approval.status === 'pending' && selectedApproval !== approval.id && (
              <Button
                onClick={() => setSelectedApproval(approval.id)}
                variant="outline"
                size="sm"
                className="w-full mt-3"
              >
                Prüfen
              </Button>
            )}
          </div>
        ))}

        {approvals?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Keine Freigaben vorhanden
          </p>
        )}
      </div>
    </Card>
  );
};
