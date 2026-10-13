import React, { useEffect, useState } from 'react';
import { getAdminUsers } from '@/services/adminUsersService';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, RefreshCw } from "lucide-react";

const AdminDashboard = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const { toast } = useToast();

    const fetchUsers = async () => {
        try {
            setLoading(true);
            setLoadError('');
            setUsers(await getAdminUsers());
        } catch (error) {
            console.error("Error fetching users:", error);
            const message = error.status === 403
                ? 'Your account does not have permission to view this user list.'
                : error.status === 401
                    ? 'Your session has expired. Please sign in again.'
                    : 'Unable to load users. Please try again.';
            setLoadError(message);
            toast({
                title: "Error",
                description: message,
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    return (
        <div className="container mx-auto py-10 px-4">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Application users</h1>
                    <p className="text-muted-foreground mt-2">Registered Airabook users across Personal and Enterprise workspaces.</p>
                    <p className="text-sm text-muted-foreground mt-2">Users appear after their Firebase account is synchronized with the backend. Plan and storage reporting are not included here.</p>
                </div>
                <Button className="rounded-[8px]" onClick={fetchUsers} variant="outline" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {loading ? 'Refreshing…' : 'Refresh List'}
                </Button>
            </div>

            <div className="rounded-[8px] border bg-card text-card-foreground shadow-sm" aria-busy={loading}>
                <Table className="text-base">
                    <TableHeader>
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Platform role</TableHead>
                            <TableHead>Account status</TableHead>
                            <TableHead>Email verification</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="p-6">
                                    <p role="status" className="mb-4 text-sm text-muted-foreground">Loading users…</p>
                                    <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
                                        {[0, 1, 2].map((row) => <div key={row} className="h-12 rounded-[8px] bg-muted" />)}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : loadError ? (
                            <TableRow>
                                <TableCell colSpan={4} className="py-10 text-center">
                                    <p role="alert" className="mb-4 text-base text-destructive">{loadError}</p>
                                    <Button className="rounded-[8px]" variant="outline" onClick={fetchUsers}>Retry</Button>
                                </TableCell>
                            </TableRow>
                        ) : users.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                    No users found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            users.map((user) => {
                                const name = user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unnamed user';
                                const role = user.systemRole === 'SYSTEM_ADMIN' || user.systemRole === 'ADMIN'
                                    ? 'System Admin' : user.systemRole === 'USER' ? 'User' : user.systemRole || 'Unknown';

                                return (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9">
                                                    <AvatarImage src={user.avatarUrl} alt={name} />
                                                    <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div className="flex min-w-0 flex-col [overflow-wrap:anywhere]">
                                                    <span>{name}</span>
                                                    <span className="text-sm text-muted-foreground">{user.email || 'No email recorded'}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center px-2 py-1 rounded-[8px] text-sm font-medium bg-app-violet/10 text-app-violet">
                                                {role}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {user.status || 'Unknown'}
                                        </TableCell>
                                        <TableCell>
                                            {user.emailVerified === true ? 'Verified' : user.emailVerified === false ? 'Not verified' : 'Unknown'}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

export default AdminDashboard;
