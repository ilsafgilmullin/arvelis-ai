import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrandLockup } from './Brand';

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally do not persist error details in this frontend-only preview.
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="fatal-error-shell" role="alert">
        <section className="fatal-error-card">
          <BrandLockup compact />
          <p className="section-kicker">INTERFACE ERROR</p>
          <h1>Интерфейс не удалось отобразить</h1>
          <p>
            Локальная preview-версия столкнулась с ошибкой интерфейса. Никакой AI-запрос или серверная операция не выполнялись.
          </p>
          <button className="button button--primary" type="button" onClick={this.reload}>
            Перезагрузить интерфейс
          </button>
        </section>
      </main>
    );
  }
}
