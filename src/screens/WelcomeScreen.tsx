import { useEffect, useRef } from 'react';
import { BrandLockup } from '../components/Brand';

export function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const timeout = window.setTimeout(() => onCompleteRef.current(), reducedMotion ? 220 : 1050);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <main className="app-splash" aria-label="ARVELIS AI">
      <section className="app-splash__brand" aria-hidden="true">
        <BrandLockup />
      </section>
      <div className="app-splash__footer">
        <span>ARVELIS AI</span>
        <p>Профессиональный интеллектуальный ассистент</p>
      </div>
    </main>
  );
}
