'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { volverAVersion, type Resultado } from './acciones'

export type VersionFila = {
  version: number
  estado: 'borrador' | 'publicada' | 'archivada'
  nota: string
  creado_por: string | null
  creado_en: string
  publicado_por: string | null
  publicado_en: string | null
  cuadros: number
}

const ESTADOS = { publicada: { texto: 'En el bot', clase: 'ok' }, borrador: { texto: 'Borrador', clase: 'warn' }, archivada: { texto: 'Anterior', clase: 'neu' } }
const cuando = (t: string | null) => t
  ? new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' })
  : '—'

// RF-06: cada publicación deja una versión; volver a una anterior la copia como borrador para publicarla de nuevo.
export function Historial({ versiones, hayBorrador }: { versiones: VersionFila[]; hayBorrador: boolean }) {
  const router = useRouter()
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, iniciar] = useTransition()

  function volver(version: number) {
    const texto = hayBorrador
      ? `Ya hay un borrador abierto. ¿Reemplazarlo por una copia de la versión ${version}? Se pierden los cambios del borrador actual.`
      : `¿Abrir un borrador con la versión ${version}? El bot no cambia hasta que lo publiques.`
    if (!confirm(texto)) return
    iniciar(async () => {
      const r = await volverAVersion(version, hayBorrador)
      setAviso(r)
      if (!r.error) router.push('/bot?t=flujo')
    })
  }

  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>Historial de versiones del flujo</h2>
          <small>Cada vez que se publica queda una versión con quién y cuándo. Para volver a una anterior se abre como borrador, se revisa y se publica.</small>
        </div>
      </div>
      {(aviso.error || aviso.ok) && <div className="panel-b"><div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div></div>}
      <div className="tablewrap">
        <table>
          <thead><tr><th>Versión</th><th>Estado</th><th>Nota</th><th>Publicada</th><th>Por</th><th className="r">Cuadros</th><th></th></tr></thead>
          <tbody>
            {versiones.map((v) => (
              <tr key={v.version}>
                <td className="mono">{v.version}</td>
                <td><span className={`chip ${ESTADOS[v.estado].clase}`}>{ESTADOS[v.estado].texto}</span></td>
                <td>{v.nota || <span className="muted">—</span>}</td>
                <td className="mono">{v.estado === 'borrador' ? <span className="muted">abierto {cuando(v.creado_en)}</span> : cuando(v.publicado_en)}</td>
                <td>{(v.estado === 'borrador' ? v.creado_por : v.publicado_por) ?? <span className="muted">—</span>}</td>
                <td className="r mono">{v.cuadros}</td>
                <td className="r">
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <Link className="btn chico" href={v.estado === 'borrador' ? '/bot?t=flujo' : `/bot?t=flujo&v=${v.version}`}>
                      {v.estado === 'borrador' ? 'Seguir editando' : 'Ver'}
                    </Link>
                    {v.estado === 'archivada' && (
                      <button className="btn chico" disabled={ocupado} onClick={() => volver(v.version)}>Volver a esta</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
