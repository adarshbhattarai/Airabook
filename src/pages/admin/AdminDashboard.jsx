import React, { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firestore as db, functions } from '@/lib/firebase';
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
    const [syncingUserId, setSyncingUserId] = useState(null);
    const { toast } = useToast();

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const usersRef = collection(db, 'users');
            // Order by created/updated if possible, or just default query
            const q = query(usersRef);
            const snapshot = await getDocs(q);

            const usersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setUsers(usersData);
        } catch (error) {
            console.error("Error fetching users:", error);
            toast({
                title: "Error",
                description: "Failed to load users. Ensure you are an admin.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleSyncStorage = async (userId) => {
        setSyncingUserId(userId);
        try {
            const recalculateFn = httpsCallable(functions, 'recalculateStorageUsage');
            const result = await recalculateFn({ targetUserId: userId });

            const { totalMB, fileCount } = result.data;

            toast({
                title: "Sync Complete",
                description: `Storage usage updated: ${totalMB} MB (${fileCount} files).`,
                variant: "appSuccess"
            });

            // Refresh users to show updated data
            await fetchUsers();
        } catch (error) {
            console.error("Sync error:", error);
            toast({
                title: "Sync Failed",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setSyncingUserId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-app-iris" />
            </div>
        );
    }

    return (
        <div className="container mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
                    <p className="text-muted-foreground mt-2">Manage users and system resources.</p>
                </div>
                <Button onClick={fetchUsers} variant="outline" size="sm">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh List
                </Button>
            </div>

            <div className="rounded-md border bg-card text-card-foreground shadow">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Plan</TableHead>
                            <TableHead>Storage Used</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                    No users found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            users.map((user) => {
                                const storageBytes = user.quotaCounters?.storageBytesUsed || 0;
                                const storageMB = (storageBytes / (1024 * 1024)).toFixed(2);

                                return (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9">
                                                    <AvatarImage src={user.photoURL} alt={user.displayName} />
                                                    <AvatarFallback>{(user.displayName || 'U').charAt(0)}</AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col">
                                                    <span>{user.displayName || 'Unnamed User'}</span>
                                                    <span className="text-xs text-muted-foreground">{user.email}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-app-violet/10 text-app-violet">
                                                {user.billing?.planTier || 'Free'}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-mono">{storageMB} MB</span>
                                                <span className="text-xs text-muted-foreground">{storageBytes.toLocaleString()} bytes</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="appGhost"
                                                size="sm"
                                                onClick={() => handleSyncStorage(user.id)}
                                                disabled={syncingUserId === user.id}
                                            >
                                                {syncingUserId === user.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    "Sync Storage"
                                                )}
                                            </Button>
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
