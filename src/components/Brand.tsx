export function BrandMark({ size = 'default' }: { size?: 'default' | 'compact' | 'hero' }) {
  const className = `brand-mark brand-mark--${size}`;

  return (
    <svg className={className} viewBox="0 0 120 120" role="img" aria-label="ARVELIS AI">
      <defs>
        <linearGradient id="arvelisGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0cf74" />
          <stop offset="0.45" stopColor="#d5a842" />
          <stop offset="1" stopColor="#9d6d20" />
        </linearGradient>
      </defs>
      <path className="brand-mark__orbit" d="M59 10a50 50 0 0 0 0 100" />
      <g className="brand-mark__dots">
        <circle cx="75.5" cy="12.8" r="1.6" /><circle cx="86.6" cy="17.2" r="1.7" /><circle cx="96.2" cy="24.5" r="1.8" /><circle cx="103.7" cy="34" r="1.9" /><circle cx="108.4" cy="45" r="2" /><circle cx="110" cy="57" r="2.1" /><circle cx="108.7" cy="69.1" r="2.2" /><circle cx="104.5" cy="80.3" r="2.3" /><circle cx="97.4" cy="90.1" r="2.35" /><circle cx="88.1" cy="97.9" r="2.4" /><circle cx="77.2" cy="102.9" r="2.45" />
      </g>
      <path className="brand-mark__letter" d="M35 84 57 29h9l22 55H75L61.5 48 48 84Zm18-20h17l4 10H49Z" fillRule="evenodd" />
    </svg>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="brand-lockup brand-lockup--compact" aria-label="ARVELIS AI">
        <BrandMark size="compact" />
        <span className="brand-lockup__compact-word">ARVELIS <em>AI</em></span>
      </div>
    );
  }

  return (
    <div className="brand-lockup" aria-label="ARVELIS AI">
      <BrandMark size="hero" />
      <div className="brand-lockup__wordmark">ARVELIS</div>
      <div className="brand-lockup__ai"><i />AI<i /></div>
      <div className="brand-lockup__tagline">INTELLIGENCE. PRECISION. RESULTS.</div>
    </div>
  );
}
