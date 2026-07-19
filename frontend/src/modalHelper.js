import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

let resolver = null;

export function showModal(title, message, options = {}) {
  return new Promise((resolve) => {
    resolver = resolve;
    const event = new CustomEvent('show-modal', { detail: { title, message, options } });
    window.dispatchEvent(event);
  });
}

function ModalRoot() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState({ title: '', message: '', options: {} });

  useEffect(() => {
    function handler(e) {
      setPayload(e.detail);
      setOpen(true);
    }
    window.addEventListener('show-modal', handler);
    return () => window.removeEventListener('show-modal', handler);
  }, []);

  if (!open) return null;

  const { title, message, options } = payload;

  function close(result) {
    setOpen(false);
    if (resolver) {
      resolver(result);
      resolver = null;
    }
  }

  return ReactDOM.createPortal(
    <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.4)',zIndex:9999}}>
      <div style={{background:'white',padding:20,borderRadius:8,maxWidth:600,width:'90%'}}>
        <h3>{title}</h3>
        <div style={{margin:'12px 0',whiteSpace:'pre-wrap'}}>{message}</div>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
          {options.cancelText ? <button onClick={() => close(false)} className="btn-secondary">{options.cancelText}</button> : null}
          <button onClick={() => close(true)} className="btn-primary">{options.confirmText || 'OK'}</button>
        </div>
      </div>
    </div>, document.body
  );
}

export default ModalRoot;
