'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Filtro del Registro de IA por día (hora de Colombia): pastillas con los días que tuvieron llamadas y un calendario
// para buscar cualquier otro día. Sin día elegido se ven las últimas 100 llamadas.
export default function FiltroDia({ dia, dias }: { dia: string | null; dias: [string, number][] }) {
  const router = useRouter()
  const ir = (d: string | null) => router.push(d ? `/agente/registro?dia=${d}` : '/agente/registro', { scroll: false })
  const nombre = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <Link href="/agente/registro" scroll={false} className={`chip ${dia ? 'neu' : 'ok'}`}>Últimas 100</Link>
      {dias.map(([d, n]) => (
        <Link key={d} href={`/agente/registro?dia=${d}`} scroll={false} className={`chip ${d === dia ? 'ok' : 'neu'}`}>
          {nombre(d)} · {n}
        </Link>
      ))}
      <input type="date" value={dia ?? ''} onChange={(e) => ir(e.target.value || null)} aria-label="Elegir día"
        style={{ padding: '2px 8px', fontSize: 12 }} />
    </div>
  )
}
