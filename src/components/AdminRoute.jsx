import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';
import { useSystemAdminAccess } from '@/hooks/useSystemAdminAccess';
import { WORKSPACE_CHOOSER_PATH } from '@/services/workspaceSelection';

const AdminRoute = ({ children }) => {
    const { user, loading } = useAuth();
    const { isSystemAdmin, checkingSystemAdmin } = useSystemAdminAccess();
    const location = useLocation();

    if (loading || checkingSystemAdmin) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-app-iris" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/v2/personal-login" replace state={{ from: location }} />;
    }

    if (!isSystemAdmin) {
        return <Navigate to={WORKSPACE_CHOOSER_PATH} replace />;
    }

    return children;
};

export default AdminRoute;
