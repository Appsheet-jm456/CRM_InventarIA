'use client'

import { useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  activarDocumento, borrarDocumento, probarBusqueda, reemplazarDocumento, subirDocumento, verTrozos, type Hallazgo, type Resultado,
} from './documentos'

export type Documento = {
  id: number; nombre: string; tipo: string; archivo: string; tamano: number; estado: string; error: string | null
  fragmentos: number; activo: boolean; subido_en: string; usuarios: { nombre: string } | null
}

const ACEPTA = '.txt,.md,.pdf,.xlsx,.csv'
const tamano = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`)
const fecha = (iso: string) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })
const urlArchivo = (ruta: string) => `/archivos/conocimiento/${ruta.split('/').map(encodeURIComponent).join('/')}`

function BotonSubir() {
  const { pending } = useFormStatus()
  return <button className="btn primary" disabled={pending}>{pending ? 'Leyendo el documento…' : 'Subir'}</button>
}

function FilaDocumento({ d, ocupado, correr }: { d: Documento; ocupado: boolean; correr: (a: () => Promise<Resultado>) => Promise<void> }) {
  const [trozos, setTrozos] = useState<{ orden: number; texto: string }[] | null>(null)
  const [total, setTotal] = useState(0)
  const reemplazo = useRef<HTMLInputElement>(null)
  const estado = d.estado === 'listo' ? (d.activo ? 'ok' : 'neu') : d.estado === 'error' ? 'bad' : 'warn'
  return (
    <article className={`documento${d.activo && d.estado === 'listo' ? ' activo' : ''}`}>
      <div className="documento-h">
        <span className="documento-tipo mono">{d.tipo.toUpperCase()}</span>
        <div className="documento-txt">
          <a href={urlArchivo(d.archivo)} target="_blank" rel="noreferrer"><b>{d.nombre}</b></a>
          <small className="muted">
            {tamano(d.tamano)} · {d.fragmentos.toLocaleString('es-CO')} trozos · subido {fecha(d.subido_en)}{d.usuarios?.nombre ? ` por ${d.usuarios.nombre}` : ''}
          </small>
          {d.error && <small className="accion-aviso">{d.error}</small>}
        </div>
        <span className={`chip ${estado}`}>
          {d.estado === 'listo' ? (d.activo ? 'Listo' : 'Apagado') : d.estado === 'error' ? 'Error' : 'Procesando'}
        </span>
        <label className="check">
          <input type="checkbox" role="switch" className="switch" checked={d.activo} disabled={ocupado || d.estado !== 'listo'}
            onChange={(e) => correr(() => activarDocumento(d.id, e.target.checked))} />
          <span>{d.activo ? 'Activo' : 'Apagado'}</span>
        </label>
      </div>
      <div className="row">
        <button type="button" className="btn chico" disabled={ocupado} onClick={async () => {
          if (trozos) { setTrozos(null); return }
          const r = await verTrozos(d.id)
          setTrozos(r.trozos ?? []); setTotal(r.total ?? 0)
        }}>{trozos ? 'Ocultar texto' : 'Ver texto extraído'}</button>
        <label className="btn chico" htmlFor={`reemplazo-${d.id}`}>Reemplazar</label>
        <input id={`reemplazo-${d.id}`} ref={reemplazo} type="file" accept={ACEPTA} className="apariencia-archivo" disabled={ocupado}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const datos = new FormData()
            datos.set('archivo', f)
            await correr(() => reemplazarDocumento(d.id, datos))
            if (reemplazo.current) reemplazo.current.value = ''
          }} />
        <button type="button" className="btn chico peligro" disabled={ocupado}
          onClick={() => confirm(`¿Borrar «${d.nombre}» y sus ${d.fragmentos} trozos?`) && correr(() => borrarDocumento(d.id))}>Borrar</button>
      </div>
      {trozos && (
        <ol className="documento-trozos">
          {trozos.map((t) => <li key={t.orden}>{t.texto}</li>)}
          {total > trozos.length && <li className="muted">… y {total - trozos.length} trozos más.</li>}
        </ol>
      )}
    </article>
  )
}

function ProbarBusqueda() {
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [r, setR] = useState<{ error?: string; hallazgos?: Hallazgo[] } | null>(null)
  return (
    <section className="panel">
      <div className="panel-h"><div><h2>Probar búsqueda</h2><small>Lo que encontraría el agente: los 5 resultados más parecidos de fichas y documentos activos.</small></div></div>
      <form className="panel-b" style={{ display: 'grid', gap: 10 }}
        onSubmit={async (e) => { e.preventDefault(); setCargando(true); setR(await probarBusqueda(texto)); setCargando(false) }}>
        <div className="inline">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="¿Cuánto tarda un envío a Cali?" aria-label="Pregunta de prueba" style={{ flex: 1 }} />
          <button className="btn primary" disabled={cargando || !texto.trim()}>{cargando ? 'Buscando…' : 'Buscar'}</button>
        </div>
        {r?.error && <div className="aviso bad">{r.error}</div>}
        {r?.hallazgos && !r.hallazgos.length && <div className="aviso">No encontré nada parecido. El agente diría que no sabe y ofrecería un asesor.</div>}
        {r?.hallazgos?.map((h, i) => (
          <div key={`${h.fuente}-${h.id}`} className="documento-hallazgo">
            <small className="muted">{i + 1}. {h.fuente === 'ficha' ? 'Ficha' : 'Documento'} · {h.titulo}</small>
            <div>{h.texto.length > 400 ? h.texto.slice(0, 400) + '…' : h.texto}</div>
          </div>
        ))}
      </form>
    </section>
  )
}

export function Documentos({ documentos }: { documentos: Documento[] }) {
  const [estado, subir] = useFormState<Resultado, FormData>(subirDocumento, {})
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const formulario = useRef<HTMLFormElement>(null)
  const correr = async (accion: () => Promise<Resultado>) => {
    setOcupado(true)
    setAviso(await accion())
    setOcupado(false)
  }
  const mostrado = aviso.error || aviso.ok ? aviso : estado
  const trozos = documentos.filter((d) => d.activo && d.estado === 'listo').reduce((s, d) => s + d.fragmentos, 0)

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Documentos para el agente</h2>
            <small>
              Manuales, políticas largas, preguntas frecuentes en Excel. El agente Avi busca aquí los trozos que sirven y redacta con ellos.
              Precios y stock nunca salen de un documento: solo del inventario.
            </small>
          </div>
          <span className={`chip ${trozos ? 'ok' : 'neu'}`}>{trozos.toLocaleString('es-CO')} trozos activos</span>
        </div>
        {(mostrado.error || mostrado.ok) && (
          <div className="panel-b" style={{ paddingBottom: 0 }}>
            <div className={`aviso ${mostrado.error ? 'bad' : 'ok'}`} role="alert">{mostrado.error ?? mostrado.ok}</div>
          </div>
        )}
        <form ref={formulario} action={async (d) => { setAviso({}); await subir(d); formulario.current?.reset() }} className="panel-b inline">
          <input type="file" name="archivo" accept={ACEPTA} required aria-label="Documento" style={{ flex: 1 }} />
          <BotonSubir />
        </form>
        <div className="panel-b" style={{ paddingTop: 0 }}>
          <small className="muted">.txt, .md, PDF con texto, Excel (.xlsx) o CSV, hasta 10 MB. En Excel y CSV cada fila es un trozo con sus encabezados. Un PDF escaneado no tiene texto que leer.</small>
        </div>
        <div className="documento-lista">
          {documentos.map((d) => <FilaDocumento key={`${d.id}-${d.subido_en}-${d.activo}`} d={d} ocupado={ocupado} correr={correr} />)}
          {!documentos.length && <p className="muted" style={{ margin: 0 }}>Todavía no hay documentos.</p>}
        </div>
      </section>
      <ProbarBusqueda />
    </>
  )
}
