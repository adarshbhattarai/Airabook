import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';

const AdminRoute = ({ children }) => {
    const { user, loading } = useAuth();
    const [isAdmin, setIsAdmin] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const checkAdmin = async () => {
            if (user) {
                try {
                    const tokenResult = await user.getIdTokenResult(true); // Force refresh to get latest claims
                    setIsAdmin(!!tokenResult.claims.admin);
                } catch (error) {
                    console.error("Error checking admin status:", error);
                    setIsAdmin(false);
                }
            }
            setChecking(false);
        };

        if (!loading) {
            if (user) {
                checkAdmin();
            } else {
                setChecking(false);
            }
        }
    }, [user, loading]);

    if (loading || checking) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-app-iris" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (!isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

export default AdminRoute;
