import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrandMark } from '../components/Brand';

type State = {
  hasError: boolean;
};

export class ControlErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // CONTROL preview intentionally does not persist raw error details client-side.
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="control-fatal" role="alert">
        <section className="control-fatal__card">
          <BrandMark size="default" />
          <p className="control-kicker">CONTROL INTERFACE ERROR</p>
          <h1>ARVELIS CONTROL не удалось отобразить</h1>
          <p>Ошибка произошла только в интерфейсе preview. Production-действия, пользовательские данные и административные операции не выполнялись.</p>
          <button type="button" className="control-primary-button" onClick={this.reload}>Перезагрузить CONTROL</button>
        </section>
      </main>
    );
  }
}
