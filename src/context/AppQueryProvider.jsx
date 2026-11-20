import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';

const QuerySession = ({ children }) => {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, gcTime: 15 * 60_000, retry: false } },
  }));
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

// Keep this inside Router: auth changes reset queries/observers, not navigation.
export default function AppQueryProvider({ children }) {
  const { user } = useAuth();
  return <QuerySession key={user?.uid || 'signed-out'}>{children}</QuerySession>;
}
