import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';

export default function RequireAuth({ children, role }) {
  const { ready, isAuthenticated, role: userRole } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (role && userRole !== role) {
    return <Navigate to="/" replace />;
  }

  return children;
}
