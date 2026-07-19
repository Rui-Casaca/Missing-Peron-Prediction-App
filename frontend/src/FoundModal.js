import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

export default function FoundModal({ open, title, children, footer, onClose, id, initialFocusRef, className, onEntered }) {
  const rootRef = useRef(null);
  // keep a stable ref to onClose so the main effect doesn't re-run when parent recreates the handler
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  // keep a stable ref to initialFocusRef as well to avoid re-running effect when parent
  // recreates the ref object; we still want to read its current value when modal opens.
  const initialFocusRefRef = useRef(initialFocusRef);
  useEffect(() => { initialFocusRefRef.current = initialFocusRef; }, [initialFocusRef]);

  // Only run this effect when `open` changes. Use onCloseRef to avoid re-running when
  // parent re-creates the onClose handler (which would otherwise refocus the initial field
  // repeatedly while the modal is open, e.g. on every keystroke).
  useEffect(() => {
    if (!open) return;
    // Focus initial field when modal opens
    const t = setTimeout(() => {
      try { const ref = initialFocusRefRef.current; if (ref && ref.current && typeof ref.current.focus === 'function') ref.current.focus(); } catch (e) {}
    }, 50);

    const handleKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') onCloseRef.current && onCloseRef.current();
      if (e.key === 'Tab') {
        // trap focus inside modal
        if (!rootRef.current) return;
        const focusable = rootRef.current.querySelectorAll('a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])');
        if (!focusable || focusable.length === 0) { e.preventDefault(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // small state to trigger open animation
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!open) return;
    // trigger the enter class after mount to start animation
    const id = setTimeout(() => setEntered(true), 10);
    return () => { clearTimeout(id); setEntered(false); };
  }, [open]);

  // call onEntered when the enter state becomes true (fallback) so parent can react
  useEffect(() => {
    if (!entered) return;
    // call after a tiny delay to allow CSS/layout to settle
    const t = setTimeout(() => { try { onEntered && onEntered(); } catch (e) {} }, 50);
    return () => clearTimeout(t);
  }, [entered, onEntered]);

  if (!open) return null;

  const modalNode = (
    <div role="presentation" className={`modal-overlay ${entered ? 'modal-overlay-enter' : ''}`}>
      <div ref={rootRef} role="dialog" aria-modal="true" aria-labelledby={id ? `${id}-title` : undefined} id={id} className={`modal modal-dialog ${className || ''} ${entered ? 'modal-enter' : ''}`} onAnimationEnd={() => { try { if (entered && onEntered) onEntered(); } catch(e) {} }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 id={id ? `${id}-title` : undefined} style={{ margin: 0 }}>{title}</h3>
          <button className="modal-close" onClick={() => onClose && onClose()} aria-label="Fechar">✕</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );

  try {
    // portal directly to document.body (no intermediate host) to avoid stacking context issues
    if (typeof document !== 'undefined' && document.body) return ReactDOM.createPortal(modalNode, document.body);
  } catch (e) {
    // fallthrough to inline (shouldn't happen)
  }

  return modalNode;
}
