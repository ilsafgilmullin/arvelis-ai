import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function ChatSheet({
  children,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  className = '',
}: {
  children: ReactNode;
  onClose: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      const preferred = sheetRef.current?.querySelector<HTMLElement>('[data-chat-sheet-autofocus]');
      const firstFocusable = sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (preferred ?? firstFocusable ?? sheetRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
      if (!focusable.length) {
        event.preventDefault();
        sheetRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !sheetRef.current?.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active === last || !sheetRef.current?.contains(active))) {
        event.preventDefault();
        first?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, []);

  const classes = className ? `chat-v2-sheet ${className}` : 'chat-v2-sheet';

  return (
    <div
      className="chat-v2-overlay"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={sheetRef}
        className={classes}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
