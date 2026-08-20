import type { ReactNode } from 'react';
import { BrandLockup } from './Brand';

export function Topbar({
  title,
  subtitle,
  demo = true,
  actions,
}: {
  title: string;
  subtitle?: string;
  demo?: boolean;
  actions?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="topbar__identity">
        <div className="topbar__mobile-brand"><BrandLockup compact /></div>
        <div>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      <div className="topbar__actions">
        {actions}
        {demo ? <span className="demo-chip" title="Тестовая версия: AI и серверная часть пока не подключены">PREVIEW</span> : null}
      </div>
    </header>
  );
}
