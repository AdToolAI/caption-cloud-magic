import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Mail, CheckCircle, XCircle, MessageSquare, ListTodo, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RoleManager } from "@/components/team/RoleManager";

export default function TeamWorkspace() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInviteMember, setShowInviteMember] = useState(false);

  const [workspaceForm, setWorkspaceForm] = useState({
    name: "",
    description: "",
  });

  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "viewer" as any,
  });

  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    assigned_to: "",
    priority: "medium" as any,
    due_date: "",
  });

  useEffect(() => {
    if (user) {
      loadWorkspaces();
    }
  }, [user]);

  useEffect(() => {
    if (selectedWorkspace) {
      loadWorkspaceData();
    }
  }, [selectedWorkspace]);

  const loadWorkspaces = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('workspace_members')
      .select(`
        workspace_id,
        role,
        workspaces (*)
      `)
      .eq('user_id', user.id);

    if (data) {
      setWorkspaces(data.map((d: any) => ({ ...d.workspaces, userRole: d.role })));
      if (data.length > 0 && !selectedWorkspace) {
        setSelectedWorkspace(data[0].workspace_id);
      }
    }
  };

  const loadWorkspaceData = async () => {
    if (!selectedWorkspace) return;

    // Load members
    const { data: membersData } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', selectedWorkspace);
    setMembers(membersData || []);

    // Load tasks
    const { data: tasksData } = await supabase
      .from('content_tasks')
      .select('*')
      .eq('workspace_id', selectedWorkspace)
      .order('created_at', { ascending: false });
    setTasks(tasksData || []);

    // Load approvals
    const { data: approvalsData } = await supabase
      .from('content_approvals')
      .select('*')
      .eq('workspace_id', selectedWorkspace)
      .order('created_at', { ascending: false });
    setApprovals(approvalsData || []);
  };

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      // Create workspace
      const { data: workspace, error: wsError } = await supabase
        .from('workspaces')
        .insert({
          name: workspaceForm.name,
          description: workspaceForm.description,
          owner_id: user.id,
        })
        .select()
        .single();

      if (wsError) throw wsError;

      // Add creator as owner
      const { error: memberError } = await supabase
        .from('workspace_members')
        .insert({
          workspace_id: workspace.id,
          user_id: user.id,
          role: 'owner',
        });

      if (memberError) throw memberError;

      toast({
        title: t('success'),
        description: t('team.workspaceCreated'),
      });

      setShowCreateWorkspace(false);
      setWorkspaceForm({ name: "", description: "" });
      loadWorkspaces();
    } catch (error) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const inviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace) return;

    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      const { error } = await supabase
        .from('workspace_invitations')
        .insert({
          workspace_id: selectedWorkspace,
          email: inviteForm.email,
          role: inviteForm.role,
          invited_by: user!.id,
          expires_at: expiresAt.toISOString(),
        });

      if (error) throw error;

      toast({
        title: t('success'),
        description: t('team.inviteSent'),
      });

      setShowInviteMember(false);
      setInviteForm({ email: "", role: "viewer" });
    } catch (error) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace || !user) return;

    try {
      const { error } = await supabase
        .from('content_tasks')
        .insert({
          workspace_id: selectedWorkspace,
          title: taskForm.title,
          description: taskForm.description,
          assigned_to: taskForm.assigned_to || null,
          assigned_by: user.id,
          priority: taskForm.priority,
          due_date: taskForm.due_date || null,
        });

      if (error) throw error;

      toast({
        title: t('success'),
        description: t('team.taskCreated'),
      });

      setTaskForm({
        title: "",
        description: "",
        assigned_to: "",
        priority: "medium",
        due_date: "",
      });
      loadWorkspaceData();
    } catch (error) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const currentWorkspace = workspaces.find(w => w.id === selectedWorkspace);
  const canManage = currentWorkspace?.userRole === 'owner' || currentWorkspace?.userRole === 'admin';

  return (
    <div className="container py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t('team.title')}</h1>
          <p className="text-muted-foreground">{t('team.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreateWorkspace(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('team.createWorkspace')}
        </Button>
      </div>

      {/* Workspace Selector */}
      {workspaces.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <Label>{t('team.selectWorkspace')}</Label>
            <Select value={selectedWorkspace || ""} onValueChange={setSelectedWorkspace}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>
                    {ws.name}
                    <Badge variant="outline" className="ml-2">{ws.userRole}</Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {selectedWorkspace && (
        <Tabs defaultValue="members" className="space-y-6">
          <TabsList>
            <TabsTrigger value="members">
              <Users className="h-4 w-4 mr-2" />
              {t('team.members')}
            </TabsTrigger>
            <TabsTrigger value="roles">
              <Shield className="h-4 w-4 mr-2" />
              {t('team.roles')}
            </TabsTrigger>
            <TabsTrigger value="tasks">
              <ListTodo className="h-4 w-4 mr-2" />
              {t('team.tasks')}
            </TabsTrigger>
            <TabsTrigger value="approvals">
              <CheckCircle className="h-4 w-4 mr-2" />
              {t('team.approvals')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{t('team.teamMembers')}</CardTitle>
                  {canManage && (
                    <Button onClick={() => setShowInviteMember(true)}>
                      <Mail className="h-4 w-4 mr-2" />
                      {t('team.inviteMember')}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{member.user_id.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{member.user_id}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(member.joined_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge>{member.role}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {showInviteMember && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('team.inviteNewMember')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={inviteMember} className="space-y-4">
                    <div>
                      <Label>{t('email')}</Label>
                      <Input
                        type="email"
                        value={inviteForm.email}
                        onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label>{t('team.role')}</Label>
                      <Select value={inviteForm.role} onValueChange={(value: any) => setInviteForm({ ...inviteForm, role: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">{t('team.viewer')}</SelectItem>
                          <SelectItem value="editor">{t('team.editor')}</SelectItem>
                          <SelectItem value="admin">{t('team.admin')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit">{t('team.sendInvite')}</Button>
                      <Button type="button" variant="outline" onClick={() => setShowInviteMember(false)}>
                        {t('cancel')}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="roles">
            {selectedWorkspace && <RoleManager workspaceId={selectedWorkspace} />}
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('team.createTask')}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={createTask} className="space-y-4">
                  <div>
                    <Label>{t('team.taskTitle')}</Label>
                    <Input
                      value={taskForm.title}
                      onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>{t('team.description')}</Label>
                    <Textarea
                      value={taskForm.description}
                      onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t('team.priority')}</Label>
                      <Select value={taskForm.priority} onValueChange={(value: any) => setTaskForm({ ...taskForm, priority: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">{t('team.low')}</SelectItem>
                          <SelectItem value="medium">{t('team.medium')}</SelectItem>
                          <SelectItem value="high">{t('team.high')}</SelectItem>
                          <SelectItem value="urgent">{t('team.urgent')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t('team.dueDate')}</Label>
                      <Input
                        type="date"
                        value={taskForm.due_date}
                        onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button type="submit">{t('team.createTask')}</Button>
                </form>
              </CardContent>
            </Card>

            <div className="grid gap-4">
              {tasks.map((task) => (
                <Card key={task.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold">{task.title}</h3>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                        )}
                        <div className="flex gap-2 mt-3">
                          <Badge variant={task.status === 'done' ? 'default' : 'secondary'}>
                            {task.status}
                          </Badge>
                          <Badge variant={
                            task.priority === 'urgent' ? 'destructive' :
                            task.priority === 'high' ? 'default' : 'secondary'
                          }>
                            {task.priority}
                          </Badge>
                        </div>
                      </div>
                      {task.due_date && (
                        <span className="text-sm text-muted-foreground">
                          {new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="approvals" className="space-y-4">
            {approvals.length === 0 ? (
              <Card className="p-12">
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">{t('team.noApprovals')}</p>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4">
                {approvals.map((approval) => (
                  <Card key={approval.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{approval.content_type}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(approval.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant={
                          approval.status === 'approved' ? 'default' :
                          approval.status === 'rejected' ? 'destructive' : 'secondary'
                        }>
                          {approval.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {showCreateWorkspace && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>{t('team.newWorkspace')}</CardTitle>
            <CardDescription>{t('team.workspaceDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createWorkspace} className="space-y-4">
              <div>
                <Label>{t('team.workspaceName')}</Label>
                <Input
                  value={workspaceForm.name}
                  onChange={(e) => setWorkspaceForm({ ...workspaceForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>{t('team.description')}</Label>
                <Textarea
                  value={workspaceForm.description}
                  onChange={(e) => setWorkspaceForm({ ...workspaceForm, description: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">{t('team.create')}</Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateWorkspace(false)}>
                  {t('cancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
