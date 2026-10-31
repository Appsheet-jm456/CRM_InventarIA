'use client'

import { useRef, useState } from 'react'
import { borrarFicha, crearFicha, guardarFicha, quitarArchivo, subirArchivo, type Resultado } from './acciones'

type Ficha = {
  id: number; categoria: string; titulo: string; respuesta: string; archivo: string | null
  activa: boolean; orden: number; actualizado_en: string
}
type Correr = (a: () => Promise<Resultado>) => Promise<Resultado>

const MAX_WHATSAPP = 4096 // largo máximo de un mensaje de texto en WhatsApp
// La ruta guardada ya empieza por «conocimiento/» (la carpeta dentro del bucket del mismo nombre).
const urlArchivo = (ruta: string) => `/archivos/conocimiento/${ruta.split('/').map(encodeURIComponent).join('/')}`
const esPdf = (ruta: string) => ruta.endsWith('.pdf')

function TarjetaFicha({ f, ocupado, correr }: { f: Ficha; ocupado: boolean; correr: Correr }) {
  const [titulo, setTitulo] = useState(f.titulo)
  const [respuesta, setRespuesta] = useState(f.respuesta)
  const archivo = useRef<HTMLInputElement>(null)
  const cambio = titulo !== f.titulo || respuesta !== f.respuesta
  const sinContenido = !respuesta.trim() && !f.archivo

  return (
    <article className={`ficha-conocimiento${f.activa ? ' activa' : ''}`}>
      <div className="ficha-conocimiento-h">
        <input className="ficha-conocimiento-titulo" value={titulo} disabled={ocupado} aria-label="Título"
          onChange={(e) => setTitulo(e.target.value)} />
        <label className="check" title={sinContenido ? 'Escribe la respuesta o adjunta un archivo para activarla' : undefined}>
          <input type="checkbox" role="switch" className="switch" checked={f.activa} disabled={ocupado || (!f.activa && (sinContenido || cambio))}
            onChange={(e) => correr(() => guardarFicha(f.id, { activa: e.target.checked }))} />
          <span>{f.activa ? 'Activa' : 'Apagada'}</span>
        </label>
      </div>
      <label className="field">
        Respuesta que se envía al cliente
        <textarea rows={4} value={respuesta} disabled={ocupado} maxLength={MAX_WHATSAPP}
          placeholder="Ej.: Estamos en el C.C. … local 123, Medellín. Lunes a viernes de 8 a 6. 📍 https://maps.app.goo.gl/…"
          onChange={(e) => setRespuesta(e.target.value)} />
        <small className="muted">{respuesta.length.toLocaleString('es-CO')} / {MAX_WHATSAPP.toLocaleString('es-CO')} · *negrita* y _cursiva_ como en WhatsApp</small>
      </label>

      <div className="ficha-conocimiento-archivo">
        {f.archivo ? (
          <>
            {esPdf(f.archivo) ? (
              <a className="btn chico" href={urlArchivo(f.archivo)} target="_blank" rel="noreferrer">📄 Ver PDF</a>
            ) : (
              <a href={urlArchivo(f.archivo)} target="_blank" rel="noreferrer" title="Ver imagen completa">
                {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por la app */}
                <img src={urlArchivo(f.archivo)} alt={`Imagen de ${f.titulo}`} />
              </a>
            )}
            <button type="button" className="btn chico peligro" disabled={ocupado}
              onClick={() => confirm('¿Quitar el archivo de esta ficha?') && correr(() => quitarArchivo(f.id))}>Quitar archivo</button>
          </>
        ) : (
          <small className="muted">Opcional: una imagen o PDF (la política escrita, un mapa). Se envía junto con la respuesta.</small>
        )}
        <label className="btn chico" htmlFor={`archivo-${f.id}`}>{f.archivo ? 'Cambiar archivo' : 'Adjuntar imagen o PDF'}</label>
        <input id={`archivo-${f.id}`} ref={archivo} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="apariencia-archivo"
          disabled={ocupado}
          onChange={async (e) => {
            const elegido = e.target.files?.[0]
            if (!elegido) return
            const datos = new FormData()
            datos.set('archivo', elegido)
            await correr(() => subirArchivo(f.id, datos))
            if (archivo.current) archivo.current.value = ''
          }} />
      </div>

      <div className="row">
        <button type="button" className="btn chico primary" disabled={ocupado || !cambio || !titulo.trim()}
          onClick={() => correr(() => guardarFicha(f.id, { titulo, respuesta }))}>Guardar</button>
        {cambio && (
          <button type="button" className="btn chico" disabled={ocupado} onClick={() => { setTitulo(f.titulo); setRespuesta(f.respuesta) }}>Deshacer</button>
        )}
        <button type="button" className="btn chico peligro" disabled={ocupado}
          onClick={() => confirm(`¿Borrar la ficha «${f.titulo}»?`) && correr(() => borrarFicha(f.id))}>Borrar</button>
        <small className="muted" style={{ marginLeft: 'auto' }}>
          Actualizada {new Date(f.actualizado_en).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })}
        </small>
      </div>
    </article>
  )
}

export function Conocimiento({ fichas, usos }: { fichas: Ficha[]; usos: Record<string, string[]> }) {
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const [categoria, setCategoria] = useState('')
  const [nuevaCategoria, setNuevaCategoria] = useState('')
  const [titulo, setTitulo] = useState('')

  const correr: Correr = async (accion) => {
    setOcupado(true)
    const r = await accion()
    setAviso(r)
    setOcupado(false)
    return r
  }

  const categorias = Array.from(new Set(fichas.map((f) => f.categoria)))
  const activas = fichas.filter((f) => f.activa).length
  const categoriaElegida = categoria === '__nueva' ? nuevaCategoria : categoria

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Conocimiento del negocio</h2>
            <small>
              Preguntas frecuentes y políticas que el bot envía tal cual: las usan las Acciones («garantía», «ubicación»…) y, más adelante,
              el agente Avi. Solo se envían las fichas <b>activas</b>.
            </small>
          </div>
          <span className={`chip ${activas ? 'ok' : 'neu'}`}>{activas} de {fichas.length} activas</span>
        </div>
        {(aviso.error || aviso.ok) && (
          <div className="panel-b" style={{ paddingBottom: 0 }}>
            <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
          </div>
        )}
      </section>

      {categorias.map((c) => {
        const deCategoria = fichas.filter((f) => f.categoria === c)
        const sinActivas = !deCategoria.some((f) => f.activa)
        return (
          <section key={c} className="panel">
            <div className="panel-h">
              <div>
                <h2>{c}</h2>
                {usos[c]?.length ? (
                  <small>La usa la acción {usos[c].map((n) => `«${n}»`).join(', ')}.</small>
                ) : (
                  <small>Ninguna acción la usa todavía.</small>
                )}
              </div>
              {usos[c]?.length && sinActivas ? <span className="chip warn">Sin fichas activas: la acción no tendrá qué responder</span> : null}
            </div>
            <div className="ficha-conocimiento-lista">
              {deCategoria.map((f) => (
                <TarjetaFicha key={`${f.id}-${f.actualizado_en}`} f={f} ocupado={ocupado} correr={correr} />
              ))}
            </div>
          </section>
        )
      })}

      <section className="panel">
        <div className="panel-h"><div><h2>Nueva ficha</h2><small>Una pregunta frecuente o una política. Nace apagada: escribe la respuesta y actívala.</small></div></div>
        <form className="panel-b" style={{ display: 'grid', gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault()
            correr(async () => {
              const r = await crearFicha({ categoria: categoriaElegida, titulo })
              if (!r.error) { setTitulo(''); setNuevaCategoria(''); setCategoria('') }
              return r
            })
          }}>
          <div className="row">
            <label className="field" style={{ flex: '0 1 220px' }}>
              Categoría
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} required>
                <option value="" disabled>Elige…</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__nueva">Otra categoría…</option>
              </select>
            </label>
            {categoria === '__nueva' && (
              <label className="field" style={{ flex: '0 1 220px' }}>
                Nombre de la categoría
                <input value={nuevaCategoria} onChange={(e) => setNuevaCategoria(e.target.value)} placeholder="Configuración" required />
              </label>
            )}
            <label className="field" style={{ flex: '1 1 260px' }}>
              Título
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="¿Hacen envíos a otras ciudades?" required />
            </label>
          </div>
          <div><button className="btn primary" disabled={ocupado || !categoriaElegida.trim() || !titulo.trim()}>Crear ficha</button></div>
        </form>
      </section>
    </>
  )
}
