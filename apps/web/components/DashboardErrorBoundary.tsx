"use client";

import React, { Component } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="flex min-h-[60vh] min-w-0 items-center justify-center p-3 sm:p-6">
          <div className="flex w-full min-w-0 max-w-lg flex-col items-center gap-6 rounded-2xl border border-red-100 bg-red-50 p-5 text-center shadow-xl shadow-red-900/5 sm:p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600">
              <AlertCircle size={36} />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                Algo salió mal
              </h2>
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
                No pudimos cargar esta sección. Puedes reintentar o abrir otra
                desde el menú. Si estabas guardando un registro, consulta su
                estado antes de repetir el envío para evitar duplicados.
              </p>
            </div>
            <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <RefreshCw size={14} /> Reintentar
              </button>
              <a
                href="/dashboard"
                className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Volver al inicio
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
