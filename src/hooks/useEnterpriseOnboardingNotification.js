import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/components/ui/use-toast';
import { myEnterpriseRequestsOptions } from '@/services/enterpriseQueries';

export default function useEnterpriseOnboardingNotification() {
  const { user } = useAuth();
  const workspace = useWorkspace();
  const client = useQueryClient();
  const { toast } = useToast();
  const enabled = !!user?.uid && workspace?.mode !== 'enterprise';
  const storageKey = `airabook:dismissed-enterprise-notifications:${user?.uid}`;
  const dismissalKey = ['dismissed-enterprise-notifications', user?.uid];
  const readDismissals = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  };
  const { data: dismissed = [] } = useQuery({
    queryKey: dismissalKey,
    queryFn: readDismissals,
    initialData: readDismissals,
    staleTime: Infinity,
    enabled: !!user?.uid,
  });
  const { data } = useQuery({
    ...myEnterpriseRequestsOptions(user?.uid),
    enabled,
  });
  const latest = enabled ? data?.[0] : null;
  const request = latest && !dismissed.includes(String(latest.id)) ? latest : null;
  const dismiss = () => {
    if (!request || !user?.uid) return;
    const next = [...new Set([...readDismissals(), String(request.id)])];
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      client.setQueryData(dismissalKey, next);
    } catch {
      toast({ title: 'Could not delete notification', description: 'Browser storage is unavailable. Please try again.', variant: 'destructive' });
    }
  };
  return { request, dismiss };
}
