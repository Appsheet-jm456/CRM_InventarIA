// F4·73c (docs/AMPLIACIONES-RAM-DISCO.md, RAM-11): los aumentos de RAM o disco que el cliente pagó, debajo de su equipo, para que el
// técnico sepa qué instalar. Vienen de alistamientos.aumentos (migración 0082).
export type Aumento = { de: string; tipo: 'ram' | 'disco'; desde: number; hasta: number; texto: string; precio: number }

export function aumentosDe(aumentos: Aumento[] | null | undefined, codigo: string) {
  const todos = aumentos ?? []
  return codigo === 'pedido' ? todos : todos.filter((a) => a.de.toUpperCase() === codigo.toUpperCase())
}

export function AumentosEquipo({ aumentos, codigo }: { aumentos: Aumento[] | null | undefined; codigo: string }) {
  const lista = aumentosDe(aumentos, codigo)
  if (!lista.length) return null
  return (
    <span className="ped-aumentos">
      {lista.map((a) => <small key={`${a.tipo}-${a.de}`} className="chip warn">⚡ Instalar {a.texto.replace(/^Aumento /, '')}</small>)}
    </span>
  )
}
