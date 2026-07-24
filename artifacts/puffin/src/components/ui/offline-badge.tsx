import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { getQueueCount, syncQueue, customFetch } from '@workspace/api-client-react';
import { Button } from './button';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export function OfflineBadge() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();

  const updateCount = async () => {
    try {
      const count = await getQueueCount();
      setPendingCount(count);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    updateCount();

    const handleOnline = () => {
      setIsOffline(false);
      handleSync(); // Auto sync on connection restored
    };
    const handleOffline = () => setIsOffline(true);
    const handleQueueUpdated = () => updateCount();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-queue-updated', handleQueueUpdated);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-queue-updated', handleQueueUpdated);
    };
  }, []);

  const handleSync = async () => {
    if (isSyncing || pendingCount === 0) return;
    if (!navigator.onLine) {
      toast({ title: "Aún sin conexión", description: "No se puede sincronizar sin internet.", variant: "destructive" });
      return;
    }

    setIsSyncing(true);
    try {
      const synced = await syncQueue();
      if (synced > 0) {
        toast({ title: "Sincronización Automática Exitosa", description: `Se enviaron ${synced} registros pendientes que tenías guardados.`, variant: "default" });
        queryClient.invalidateQueries();
      }
    } catch (error) {
      toast({ title: "Error", description: "Hubo un problema sincronizando algunos datos.", variant: "destructive" });
    } finally {
      setIsSyncing(false);
      updateCount();
    }
  };

  if (!isOffline && pendingCount === 0) {
    return null; // Don't show anything if everything is fine
  }

  return (
    <div className="bg-orange-500 text-white px-4 py-2 flex items-center justify-between shadow-md z-[100] fixed bottom-0 left-0 right-0 md:bottom-auto md:top-0">
      <div className="flex items-center gap-2">
        <WifiOff className="h-4 w-4" />
        <span className="text-sm font-medium">
          {isOffline ? "Modo offline: usando datos guardados localmente." : "Conexión restaurada."} 
          {pendingCount > 0 && ` Hay ${pendingCount} registro(s) pendiente(s).`}
        </span>
      </div>
      {pendingCount > 0 && !isOffline && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleSync} 
          disabled={isSyncing}
          className="bg-transparent border-white text-white hover:bg-white hover:text-orange-500 h-8"
        >
          {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Sincronizar"}
        </Button>
      )}
    </div>
  );
}
