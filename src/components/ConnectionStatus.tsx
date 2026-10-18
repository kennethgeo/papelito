"use client";
import { useEffect, useState } from "react";
import { useOptionalRealData } from "@/context/RealDataContext";

export function ConnectionStatus() {
  const data = useOptionalRealData();
  const [online, setOnline] = useState(true);
  const [returned, setReturned] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setOnline(navigator.onLine));
    const offline = () => {
      setOnline(false);
      setReturned(false);
    };
    const connected = () => {
      setOnline(true);
      setReturned(true);
    };
    window.addEventListener("online", connected);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", offline);
    };
  }, []);
  if (!online)
    return (
      <div className="connection-banner" role="status">
        Sin conexión. Podés seguir escribiendo; esperá a reconectarte para
        guardar cambios.
      </div>
    );
  if (returned)
    return (
      <div className="connection-banner online" role="status">
        {!data
          ? "Volvió la conexión."
          : data.isRefreshing
            ? "Volvió la conexión. Actualizando tus papelitos…"
            : data?.errorMessage
              ? "Volvió la conexión. No pudimos actualizar; usá «Actualizar información» para intentar de nuevo."
              : "Volvió la conexión. Tu información está actualizada."}
        <button
          className="paper-text-button"
          onClick={() => setReturned(false)}
        >
          Cerrar aviso
        </button>
      </div>
    );
  return null;
}
