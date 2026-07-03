import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public props: Props;
  public state: State;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("💥 [ErrorBoundary] Crash intercepté:", error, errorInfo);
  }

  private handleReset = () => {
    try {
      // Nettoyer d'éventuelles valeurs de géolocalisation corrompues dans le cache local
      localStorage.removeItem('dashmeals_mock_orders');
      sessionStorage.clear();
      window.location.reload();
    } catch (e) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-6 text-center">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xl">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h2 className="text-2xl font-black text-gray-800 dark:text-white mb-2 tracking-tight">Oups, une erreur est survenue !</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              L'application a rencontré une interruption inattendue. Cela peut être causé par un temps de réponse de la localisation ou un problème d'affichage de la carte sur votre appareil.
            </p>

            {this.state.error && (
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-150 dark:border-gray-700 text-left font-mono text-xs text-red-500 dark:text-red-400 overflow-auto max-h-32 mb-6">
                <strong>Erreur:</strong> {this.state.error.message || "Cause inconnue"}
              </div>
            )}

            <div className="space-y-2.5">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3.5 px-4 bg-brand-500 text-white font-bold rounded-2xl shadow-lg shadow-brand-500/20 hover:bg-brand-600 active:scale-95 transition-all text-sm uppercase tracking-wider"
              >
                Réessayer
              </button>
              <button
                onClick={this.handleReset}
                className="w-full py-3.5 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95 transition-all text-xs uppercase tracking-wide"
              >
                Vider le cache & Réinitialiser
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
