"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";

export interface ConfirmationOptions {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmAction = (options: ConfirmationOptions) => Promise<boolean>;

const ConfirmationContext = createContext<ConfirmAction | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationOptions | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback<ConfirmAction>((options) => {
    if (resolverRef.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setRequest(options);
    });
  }, []);

  useAccessibleDialog({
    open: request !== null,
    containerRef: dialogRef,
    initialFocusRef: cancelButtonRef,
    onClose: () => settle(false),
    closeOnEscape: request?.destructive !== true,
  });

  useEffect(
    () => () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    },
    [],
  );

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      {request && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5">
          <div
            ref={dialogRef}
            role={request.destructive ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-labelledby="global-confirmation-title"
            aria-describedby="global-confirmation-description"
            tabIndex={-1}
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:max-h-[calc(100dvh-2.5rem)] sm:p-6"
          >
            <div
              className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${
                request.destructive
                  ? "bg-red-100 text-red-700"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {request.destructive ? (
                <AlertTriangle className="h-7 w-7" aria-hidden="true" />
              ) : (
                <HelpCircle className="h-7 w-7" aria-hidden="true" />
              )}
            </div>
            <h2
              id="global-confirmation-title"
              className="text-xl font-semibold leading-7 tracking-tight text-slate-950"
            >
              {request.title}
            </h2>
            <p
              id="global-confirmation-description"
              className="mt-3 text-sm leading-6 text-slate-600"
            >
              {request.description}
            </p>
            {request.destructive && (
              <p className="mt-3 text-xs font-bold text-red-800">
                Por seguridad, esta confirmación no se cierra con Escape.
              </p>
            )}
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                ref={cancelButtonRef}
                type="button"
                variant="outline"
                onClick={() => settle(false)}
              >
                {request.cancelLabel ?? "Cancelar"}
              </Button>
              <Button
                type="button"
                variant={request.destructive ? "destructive" : "default"}
                onClick={() => settle(true)}
              >
                {request.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) {
    throw new Error("useConfirmation requiere ConfirmationProvider");
  }
  return confirm;
}
