'use client'

// Si una pantalla falla, se ve el aviso dentro del panel y se puede reintentar sin perder la sesión.
export default function ErrorDeModulo({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="panel">
      <div className="panel-b" style={{ display: 'grid', gap: 10 }}>
        <div className="aviso bad" role="alert">Algo falló en esta pantalla. Intenta de nuevo; si sigue, avísale al administrador.</div>
        <small className="muted mono">{error.message}{error.digest ? ` · ${error.digest}` : ''}</small>
        <div><button className="btn" onClick={reset}>Reintentar</button></div>
      </div>
    </section>
  )
}
