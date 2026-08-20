export function BrandMark({ size = 'default' }: { size?: 'default' | 'compact' | 'hero' }) {
  const className = `brand-mark brand-mark--${size}`;

  return (
    <svg className={className} viewBox="0 0 128 128" role="img" aria-label="ARVELIS AI">
      <defs>
        <linearGradient id="arvelisGold" x1="18" y1="14" x2="108" y2="114" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f3d886" />
          <stop offset="0.45" stopColor="#d6aa46" />
          <stop offset="1" stopColor="#99691f" />
        </linearGradient>
      </defs>
      <path className="brand-mark__orbit" d="M63 10C33.7 10 10 33.7 10 63s23.7 53 53 53" />
      <g className="brand-mark__dots">
        <circle cx="71" cy="10.7" r="1.7" /><circle cx="80.7" cy="13.1" r="1.8" /><circle cx="89.7" cy="17.3" r="1.9" /><circle cx="97.8" cy="23.2" r="2" /><circle cx="104.7" cy="30.5" r="2.1" /><circle cx="110.2" cy="39" r="2.2" /><circle cx="113.8" cy="48.4" r="2.25" /><circle cx="115.5" cy="58.4" r="2.3" /><circle cx="115.1" cy="68.5" r="2.25" /><circle cx="112.8" cy="78.3" r="2.2" /><circle cx="108.5" cy="87.4" r="2.1" /><circle cx="102.5" cy="95.5" r="2" /><circle cx="95" cy="102.2" r="1.9" /><circle cx="86.3" cy="107.3" r="1.8" /><circle cx="76.8" cy="110.5" r="1.7" /><circle cx="67" cy="111.8" r="1.6" />
      </g>
      <path className="brand-mark__letter" d="M34.5 91 58.7 31h10.4l24.4 60H79.2L64 51.1 48.8 91Zm20.2-22.7h18.7l4.6 11.6H50.2Z" fillRule="evenodd" />
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
