'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 minutos

export default function SessionTimeout() {
  const router = useRouter();
  const pathname = usePathname();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = useCallback(async () => {
    try {
      // Intentamos cerrar sesión en el servidor
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Error during auto-logout:', error);
    } finally {
      // Redirigir al login
      router.push('/login?reason=inactivity');
      router.refresh();
    }
  }, [router]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(handleLogout, INACTIVITY_LIMIT);
  }, [handleLogout]);

  useEffect(() => {
    // No activar en la página de login o registro
    if (pathname === '/login' || pathname === '/signup' || pathname === '/') {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    // Eventos que cuentan como actividad
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];

    // Inicializar el timer
    resetTimer();

    // Agregar listeners
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Limpieza
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [pathname, resetTimer]);

  return null; // Este componente no renderiza nada
}
