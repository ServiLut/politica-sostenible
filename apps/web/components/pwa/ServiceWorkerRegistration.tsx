"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PwaControls } from "./PwaControls";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

const UPDATE_ACTIVATION_TIMEOUT_MS = 15_000;
const UNVERSIONED_SERVICE_WORKER_REVISION = "unversioned-v5";

export function serviceWorkerScriptUrl(
  revision = process.env.NEXT_PUBLIC_APP_REVISION,
): string {
  const normalized = revision?.trim().toLowerCase() ?? "";
  const safeRevision = /^[a-f0-9]{40}$/.test(normalized)
    ? normalized
    : UNVERSIONED_SERVICE_WORKER_REVISION;
  return `/sw.js?revision=${encodeURIComponent(safeRevision)}`;
}

export function isIosInstallPlatform({
  userAgent,
  platform,
  maxTouchPoints,
}: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  return (
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  );
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as NavigatorWithStandalone).standalone === true
  );
}

function subscribeToConnectivity(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function subscribeToInstalledMode(onChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  window.addEventListener("appinstalled", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("appinstalled", onChange);
  };
}

const subscribeToStaticClientValue = () => () => undefined;

export function ServiceWorkerRegistration() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  );
  const applyingUpdateRef = useRef(false);
  const reloadOnControllerChangeRef = useRef(false);
  const reloadedRef = useRef(false);
  const updateTimeoutRef = useRef<number | null>(null);
  const isOnline = useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  );
  const installed = useSyncExternalStore(
    subscribeToInstalledMode,
    isStandalone,
    () => false,
  );
  const isIos = useSyncExternalStore(
    subscribeToStaticClientValue,
    () => isIosInstallPlatform(navigator),
    () => false,
  );

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    )
      return;

    let disposed = false;
    const installingWorkers = new WeakSet<ServiceWorker>();

    const exposeWaitingWorker = (registration: ServiceWorkerRegistration) => {
      if (
        !disposed &&
        navigator.serviceWorker.controller &&
        registration.waiting
      ) {
        setWaitingWorker(registration.waiting);
      }
    };

    const trackInstallingWorker = (registration: ServiceWorkerRegistration) => {
      const worker = registration.installing;
      if (!worker || installingWorkers.has(worker)) return;

      installingWorkers.add(worker);
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") exposeWaitingWorker(registration);
      });
    };

    const handleControllerChange = () => {
      if (disposed) return;
      const shouldReload = reloadOnControllerChangeRef.current;
      if (updateTimeoutRef.current !== null) {
        window.clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      applyingUpdateRef.current = false;
      reloadOnControllerChangeRef.current = false;
      setApplyingUpdate(false);
      setWaitingWorker(null);
      setRegistrationError(null);

      if (shouldReload && !reloadedRef.current) {
        reloadedRef.current = true;
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );

    void navigator.serviceWorker
      .register(serviceWorkerScriptUrl(), {
        scope: "/",
        updateViaCache: "none",
      })
      .then((registration) => {
        if (disposed) return;

        setRegistrationError(null);
        exposeWaitingWorker(registration);
        trackInstallingWorker(registration);
        registration.addEventListener("updatefound", () =>
          trackInstallingWorker(registration),
        );

        void registration.update().catch(() => {
          // An update check can fail normally while offline. The current worker
          // remains usable, so connectivity state is the useful user signal.
        });
      })
      .catch(() => {
        if (!disposed) {
          setRegistrationError(
            "No fue posible preparar el acceso instalable en este navegador.",
          );
        }
      });

    return () => {
      disposed = true;
      if (updateTimeoutRef.current !== null) {
        window.clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, []);

  const requestInstall = useCallback(() => {
    if (!installPrompt) return;

    void (async () => {
      try {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setRegistrationError(null);
      } catch {
        setRegistrationError(
          "El navegador no pudo abrir la instalación. Usa su menú para instalar esta aplicación.",
        );
      } finally {
        setInstallPrompt(null);
      }
    })();
  }, [installPrompt]);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker || applyingUpdateRef.current) return;

    applyingUpdateRef.current = true;
    reloadOnControllerChangeRef.current = true;
    setApplyingUpdate(true);
    setRegistrationError(null);
    updateTimeoutRef.current = window.setTimeout(() => {
      updateTimeoutRef.current = null;
      applyingUpdateRef.current = false;
      setApplyingUpdate(false);
      setRegistrationError(
        "La actualización no respondió a tiempo. Puedes volver a intentarlo sin perder tus datos locales.",
      );
    }, UPDATE_ACTIVATION_TIMEOUT_MS);

    try {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    } catch {
      if (updateTimeoutRef.current !== null) {
        window.clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      applyingUpdateRef.current = false;
      reloadOnControllerChangeRef.current = false;
      setApplyingUpdate(false);
      setWaitingWorker(null);
      setRegistrationError(
        "La actualización dejó de estar disponible. Se comprobará de nuevo al recargar.",
      );
    }
  }, [waitingWorker]);

  return (
    <PwaControls
      canInstall={installPrompt !== null}
      installGuideAvailable={isIos}
      installed={installed}
      isOnline={isOnline}
      updateAvailable={waitingWorker !== null}
      applyingUpdate={applyingUpdate}
      registrationError={registrationError}
      onInstall={requestInstall}
      onApplyUpdate={applyUpdate}
    />
  );
}
