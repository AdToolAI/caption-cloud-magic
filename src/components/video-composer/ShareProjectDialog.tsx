import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Users, Trash2, Loader2, Mail, Check, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  useComposerCollaborators,
  useInviteCollaborator,
  useRemoveCollaborator,
  type CollaboratorRole,
} from '@/hooks/useComposerCollaboration';

interface Props {
  projectId: string | undefined;
  isOwner: boolean;
  trigger?: React.ReactNode;
}

export default function ShareProjectDialog({ projectId, isOwner, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CollaboratorRole>('editor');

  const { data: collaborators, isLoading } = useComposerCollaborators(projectId);
  const invite = useInviteCollaborator(projectId);
  const remove = useRemoveCollaborator(projectId);

  const disabled = !projectId;

  const handleInvite = async () => {
    if (!email.trim()) return;
    try {
      await invite.mutateAsync({ email: email.trim(), role });
      toast({ title: 'Invitation sent', description: `${email} can now collaborate as ${role}.` });
      setEmail('');
    } catch (e: any) {
      toast({ title: 'Invite failed', description: e.message ?? 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" disabled={disabled} className="gap-2">
            <Users className="h-4 w-4" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share this project</DialogTitle>
          <DialogDescription>
            Invite teammates to collaborate in real time. They will see live cursors and can comment on scenes.
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <div className="space-y-2 rounded-lg border bg-card/40 p-3">
            <Label>Invite by email</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              />
              <Select value={role} onValueChange={(v) => setRole(v as CollaboratorRole)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleInvite} disabled={invite.isPending || !email.trim()}>
                {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Collaborators ({collaborators?.length ?? 0})
          </Label>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && (collaborators?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No collaborators yet. Invite someone above.</p>
            )}
            {collaborators?.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border bg-background/50 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate text-sm">{c.invited_email ?? c.user_id}</span>
                  {c.accepted_at ? (
                    <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" /> Active</Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{c.role}</Badge>
                  {isOwner && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove.mutate(c.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
