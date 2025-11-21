import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRoles, AppRole } from '@/hooks/useUserRoles';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireRole?: AppRole;
  requireAuth?: boolean;
}

export const ProtectedRoute = ({ 
  children, 
  requireRole,
  requireAuth = true 
}: ProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { hasRole, loading: rolesLoading } = useUserRoles();

  // Show loader while checking authentication and roles
  if (authLoading || rolesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to auth if user is not logged in and auth is required
  if (requireAuth && !user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user has required role
  if (requireRole && !hasRole(requireRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
