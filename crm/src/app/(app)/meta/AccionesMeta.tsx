'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { desconectarMeta, nuevoTokenVerificacion, registrarElWebhook, suscribirAWaba, type Resultado } from './acciones'
import { TokenUnaVez } from './Piezas'

function Boton({ texto, peligro = false }: { texto: string; peligro?: boolean }) {
  const { pending } = useFormStatus()
  return <button className={`btn ${peligro ? 'peligro' : 'primary'}`} disabled={pending}>{pending ? 'Un momento…' : texto}</button>
}

function Mensajes({ r }: { r: Resultado }) {
  return (
    <>
      {r.error && <div className="aviso bad">{r.error}</div>}
      {r.ok && <div className="aviso ok">{r.ok}</div>}
      {r.verifyToken && <TokenUnaVez token={r.verifyToken} />}
    </>
  )
}

export function RegistrarWebhook({ urlInicial, seguro }: { urlInicial: string; seguro: boolean }) {
  const [r, accion] = useFormState<Resultado, FormData>(registrarElWebhook, {})
  return (
    <form action={accion} style={{ display: 'grid', gap: 10 }}>
      <label className="field">Dirección pública del receptor
        <input name="url" defaultValue={urlInicial} placeholder="https://…/webhook" className="mono" required />
      </label>
      <div><Boton texto="Registrar webhook en Meta" /></div>
      {!seguro && <small className="muted">Funciona desde cualquier acceso: esta acción no envía secretos desde tu navegador.</small>}
      <Mensajes r={r} />
    </form>
  )
}

export function AccionesRapidas({ suscrita }: { suscrita: boolean | null }) {
  const [r, setR] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  async function ejecutar(f: () => Promise<Resultado>) {
    setOcupado(true)
    setR(await f())
    setOcupado(false)
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" disabled={ocupado} onClick={() => ejecutar(suscribirAWaba)}>
          {suscrita ? 'Volver a suscribir la app a la WABA' : 'Suscribir la app a la WABA'}
        </button>
        <button className="btn" disabled={ocupado}
          onClick={() => confirm('Se genera otro token de verificación. Después hay que registrar el webhook de nuevo. ¿Seguir?') && ejecutar(nuevoTokenVerificacion)}>
          Generar token de verificación nuevo
        </button>
      </div>
      <Mensajes r={r} />
    </div>
  )
}

export function Desconectar() {
  const [r, accion] = useFormState<Resultado, FormData>(desconectarMeta, {})
  const router = useRouter()
  // Al desconectar, esta sección desaparece de la página: se deja ver el aviso un momento y luego se recarga.
  useEffect(() => {
    if (!r.ok) return
    const t = setTimeout(() => router.refresh(), 2500)
    return () => clearTimeout(t)
  }, [r.ok, router])
  return (
    <form action={accion} style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
      <label className="field">Para borrar la conexión y sus secretos escribe DESCONECTAR
        <input name="confirmar" autoComplete="off" placeholder="DESCONECTAR" />
      </label>
      <div><Boton texto="Desconectar de Meta" peligro /></div>
      <Mensajes r={r} />
    </form>
  )
}
