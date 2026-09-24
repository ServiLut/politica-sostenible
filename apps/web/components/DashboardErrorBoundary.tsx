"use client";

import React, { Component } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-8">
          <div className="flex max-w-lg flex-col items-center gap-6 rounded-2xl border border-red-100 bg-red-50 p-8 text-center shadow-xl shadow-red-900/5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600">
              <AlertCircle size={36} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-900">
                Algo salió mal
              </h2>
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
                Esta sección encontró un error inesperado. Puedes intentar
                recargarla o volver al inicio.
              </p>
              {this.state.error && (
                <p className="mt-3 rounded-xl bg-red-100 px-4 py-2 text-xs font-mono text-red-700">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-700"
              >
                <RefreshCw size={14} /> Reintentar
              </button>
              <a
                href="/dashboard"
                className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
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
