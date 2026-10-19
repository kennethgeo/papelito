'use client';
import { useEffect, useState } from 'react';
import { beginPasskeyLogin, completePasskeyLogin } from '@/lib/data/passkey-actions';
import { callServerAction } from '@/lib/client-actions';
export function PasskeyLoginButton({ next = '/' }: { next?: string }) {
  const [supported,setSupported] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState('');
  useEffect(()=>{queueMicrotask(()=>setSupported('PublicKeyCredential' in window && window.isSecureContext));},[]);
  if(!supported) return null;
  return <div className="passkey-access"><button type="button" className="paper-outline-button" disabled={busy} onClick={async()=>{
    if(busy)return; setBusy(true);setError('');
    try{ const options=await callServerAction(()=>beginPasskeyLogin());if(!options.success||!options.data)throw new Error(options.error||'No pudimos preparar el acceso.');
      const {startAuthentication}=await import('@simplewebauthn/browser');const response=await startAuthentication({optionsJSON:options.data});
      const verified=await callServerAction(()=>completePasskeyLogin(response));if(!verified.success)throw new Error(verified.error);
      window.location.assign(next.startsWith('/')&&!next.startsWith('//')?next:'/');
    }catch(e){setError(e instanceof Error&&e.name==='NotAllowedError'?'El acceso se canceló o no hay una passkey disponible. Podés usar Google o correo.':e instanceof Error?e.message:'No pudimos verificar la passkey.');}finally{setBusy(false);}
  }}>{busy?'Verificando dispositivo…':'Entrar con passkey'}</button><p className="field-help">Usá una passkey registrada previamente en Mi cuenta.</p>{error&&<p role="alert" className="workshop-error">{error}</p>}</div>;
}
