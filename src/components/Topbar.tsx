import { BrandLockup } from './Brand';

export function Topbar({ title, subtitle, demo = true }: { title: string; subtitle?: string; demo?: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar__identity">
        <div className="topbar__mobile-brand"><BrandLockup compact /></div>
        <div>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {demo ? <span className="demo-chip" title="Реальный AI/backend не подключён">DEMO</span> : null}
    </header>
  );
}
