import Link from 'next/link'

export function SinPermiso() {
  return (
    <section className="panel">
      <div className="panel-h">
        <h2>No tienes permiso para este módulo</h2>
      </div>
      <div className="panel-b row">
        <span className="muted">Si lo necesitas, pídele al administrador que se lo dé a tu rol.</span>
        <Link className="btn" href="/">
          Volver al inicio
        </Link>
      </div>
    </section>
  )
}
