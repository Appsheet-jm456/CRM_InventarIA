import Link from 'next/link'

const PESTANAS = [
  { ruta: '/inventario', texto: 'Equipos' },
  { ruta: '/inventario/cargar', texto: 'Cargar Excel', escribe: true },
  { ruta: '/inventario/catalogos', texto: 'Catálogos' },
]

export function Pestanas({ activa, administra, children }: { activa: string; administra: boolean; children?: React.ReactNode }) {
  return (
    <div className="row">
      <div className="row">
        {PESTANAS.filter((p) => administra || !p.escribe).map((p) => (
          <Link key={p.ruta} className={`pastilla${activa === p.ruta ? ' activa' : ''}`} href={p.ruta}>{p.texto}</Link>
        ))}
      </div>
      <div className="row" style={{ marginLeft: 'auto' }}>{children}</div>
    </div>
  )
}
