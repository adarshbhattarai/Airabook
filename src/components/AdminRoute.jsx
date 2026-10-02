import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';
import { useSystemAdminAccess } from '@/hooks/useSystemAdminAccess';

const AdminRoute = ({ children }) => {
    const { user, loading } = useAuth();
    const { isSystemAdmin, checkingSystemAdmin } = useSystemAdminAccess();

    if (loading || checkingSystemAdmin) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-app-iris" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/v2/login" replace />;
    }

    if (!isSystemAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

export default AdminRoute;
