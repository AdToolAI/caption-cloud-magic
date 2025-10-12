import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users, Edit2, Trash2 } from "lucide-react";

type Role = "owner" | "admin" | "editor" | "viewer";

interface UserRole {
  id: string;
  user_id: string;
  workspace_id: string;
  role: Role;
  granted_at: string;
  profiles?: {
    email: string;
  };
}

interface RoleManagerProps {
  workspaceId: string;
}

export function RoleManager({ workspaceId }: RoleManagerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(null);

  useEffect(() => {
    if (user && workspaceId) {
      loadUserRoles();
      checkCurrentUserRole();
    }
  }, [user, workspaceId]);

  const loadUserRoles = async () => {
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from('user_roles')
      .select(`
        *,
        profiles:user_id (
          email
        )
      `)
      .eq('workspace_id', workspaceId)
      .order('granted_at', { ascending: false });

    if (error) {
      console.error('Error loading user roles:', error);
      return;
    }

    setUserRoles(data as any || []);
  };

  const checkCurrentUserRole = async () => {
    if (!user || !workspaceId) return;

    const { data, error } = await supabase
      .rpc('get_user_role', {
        _user_id: user.id,
        _workspace_id: workspaceId
      });

    if (!error && data) {
      setCurrentUserRole(data);
    }
  };

  const updateRole = async (roleId: string, newRole: Role) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('id', roleId);

      if (error) throw error;

      toast({
        title: t('roles.roleUpdated'),
        description: t('roles.roleUpdatedDescription'),
      });

      loadUserRoles();
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const removeRole = async (roleId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', roleId);

      if (error) throw error;

      toast({
        title: t('roles.roleRemoved'),
        description: t('roles.roleRemovedDescription'),
      });

      loadUserRoles();
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeVariant = (role: Role) => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'admin':
        return 'secondary';
      case 'editor':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const canManageRoles = currentUserRole === 'owner' || currentUserRole === 'admin';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <CardTitle>{t('roles.title')}</CardTitle>
        </div>
        <CardDescription>{t('roles.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {userRoles.map((userRole) => (
            <div key={userRole.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-4">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{userRole.profiles?.email || 'Unknown'}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('roles.grantedAt')}: {new Date(userRole.granted_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canManageRoles && userRole.role !== 'owner' ? (
                  <>
                    <Select
                      value={userRole.role}
                      onValueChange={(value) => updateRole(userRole.id, value as Role)}
                      disabled={loading}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">{t('roles.admin')}</SelectItem>
                        <SelectItem value="editor">{t('roles.editor')}</SelectItem>
                        <SelectItem value="viewer">{t('roles.viewer')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeRole(userRole.id)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Badge variant={getRoleBadgeVariant(userRole.role)}>
                    {t(`roles.${userRole.role}`)}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>

        {!canManageRoles && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              {t('roles.noPermission')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}