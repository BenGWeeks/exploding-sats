import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';

interface NostrProviderProps {
  children: React.ReactNode;
}

interface NostrControlContextType {
  closeAllConnections: () => Promise<void>;
}

const NostrControlContext = createContext<NostrControlContextType | null>(null);

export function useNostrControl() {
  const context = useContext(NostrControlContext);
  if (!context) {
    throw new Error('useNostrControl must be used within NostrProvider');
  }
  return context;
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children } = props;
  const { config } = useAppContext();

  const queryClient = useQueryClient();

  // Create NPool instance only once
  const pool = useRef<NPool | undefined>(undefined);

  // Use refs so the pool always has the latest data
  const relayMetadata = useRef(config.relayMetadata);

  // Invalidate Nostr queries when relay metadata changes
  useEffect(() => {
    relayMetadata.current = config.relayMetadata;
    queryClient.invalidateQueries({ queryKey: ['nostr'] });
  }, [config.relayMetadata, queryClient]);

  // Function to create a new NPool instance
  const createPool = useCallback(() => {
    return new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters: NostrFilter[]) {
        const routes = new Map<string, NostrFilter[]>();

        // Route to all read relays
        const readRelays = relayMetadata.current.relays
          .filter(r => r.read)
          .map(r => r.url);

        for (const url of readRelays) {
          routes.set(url, filters);
        }

        return routes;
      },
      eventRouter(_event: NostrEvent) {
        // Get write relays from metadata
        const writeRelays = relayMetadata.current.relays
          .filter(r => r.write)
          .map(r => r.url);

        const allRelays = new Set<string>(writeRelays);

        return [...allRelays];
      },
    });
  }, []);

  // Initialize NPool only once
  if (!pool.current) {
    pool.current = createPool();
  }

  // Close all relay connections (for gameplay performance)
  const closeAllConnections = useCallback(async () => {
    if (pool.current) {
      await pool.current.close();
      // Create a fresh pool for future use
      pool.current = createPool();
    }
  }, [createPool]);

  const controlValue = { closeAllConnections };

  return (
    <NostrControlContext.Provider value={controlValue}>
      <NostrContext.Provider value={{ nostr: pool.current }}>
        {children}
      </NostrContext.Provider>
    </NostrControlContext.Provider>
  );
};

export default NostrProvider;
