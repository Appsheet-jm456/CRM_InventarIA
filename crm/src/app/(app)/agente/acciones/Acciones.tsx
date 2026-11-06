'use client'

import { useState } from 'react'
import {
  activarAccion, borrarAccion, crearAccion, guardarAccion, moverAccion, probarFrase, type Prueba, type Resultado,
} from './acciones'
import { CONDICION_EQUIPO, FORMAS, PASOS, pasoListo, pasoVacio, type Condicion, type CondicionFrase, type Paso } from './tipos'
import { EditorCondicionEquipo, EditorFicha } from './EditorFicha'
import type { DatoEquipo, EquipoEjemplo } from '../personalidad/PlantillaEquipos'

type Accion = {
  id: number; nombre: string; prioridad: number; activa: boolean; sistema: boolean
  cuando: Condicion[]; hacer: Paso[]; actualizado_en: string
}
type Contexto = {
  categorias: Record<string, number>; bots: { id: number; nombre: string }[]; hayCuentas: boolean
  atributos: DatoEquipo[]; ejemplo: EquipoEjemplo | null // para la ficha del equipo (F4·42)
}
type Correr = (a: () => Promise<Resultado>) => Promise<Resultado>

// Aviso por paso: lo que hace que el paso no envíe nada aunque la acción esté activa.
function avisoPaso(p: Paso, ctx: Contexto): string | null {
  if (!pasoListo(p)) return 'Este paso llega en una tarea siguiente: la acción no se puede activar todavía.'
  if (p.tipo === 'conocimiento' && p.categoria && !ctx.categorias[p.categoria]) return `«${p.categoria}» no tiene fichas activas: no se enviará nada.`
  if ((p.tipo === 'cuentas' || (p.tipo === 'flujo' && p.flujo === 'compra')) && !ctx.hayCuentas)
    return p.tipo === 'cuentas' ? 'Todavía no hay texto de cuentas (pestaña Compra): no se enviará nada.' : 'Sin texto de cuentas (pestaña Compra), al confirmar la compra el chat pasa a un asesor para que las envíe.'
  return null
}

function EditorPaso({ p, ctx, cambiar, quitar, disabled }: {
  p: Paso; ctx: Contexto; cambiar: (p: Paso) => void; quitar: () => void; disabled: boolean
}) {
  const aviso = avisoPaso(p, ctx)
  return (
    <div className="accion-paso">
      <div className="accion-paso-fila">
        <select value={p.tipo} disabled={disabled} aria-label="Tipo de paso" onChange={(e) => cambiar(pasoVacio(e.target.value as Paso['tipo']))}>
          {PASOS.map((x) => <option key={x.tipo} value={x.tipo}>{x.texto}</option>)}
        </select>
        {p.tipo === 'conocimiento' && (
          <select value={p.categoria} disabled={disabled} aria-label="Categoría" onChange={(e) => cambiar({ ...p, categoria: e.target.value })}>
            <option value="" disabled>Elige la categoría…</option>
            {Object.keys(ctx.categorias).map((c) => <option key={c} value={c}>{c} ({ctx.categorias[c]} activas)</option>)}
          </select>
        )}
        {p.tipo === 'bot' && (
          <select value={p.bot_id || ''} disabled={disabled} aria-label="Bot" onChange={(e) => cambiar({ ...p, bot_id: Number(e.target.value) })}>
            <option value="" disabled>Elige el bot…</option>
            {ctx.bots.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        )}
        {p.tipo === 'flujo' && (
          <select value={p.flujo} disabled={disabled} aria-label="Flujo" onChange={(e) => cambiar({ ...p, flujo: e.target.value as 'compra' | 'cotizacion' })}>
            <option value="compra">Compra</option>
            <option value="cotizacion">Cotización</option>
          </select>
        )}
        {p.tipo === 'etiqueta' && (
          <input value={p.etiqueta} disabled={disabled} placeholder="Pidio-Ubicacion" aria-label="Etiqueta" onChange={(e) => cambiar({ ...p, etiqueta: e.target.value })} />
        )}
        <button type="button" className="btn chico" disabled={disabled} onClick={quitar} aria-label="Quitar paso">✕</button>
      </div>
      {p.tipo === 'texto' && (
        <textarea rows={2} value={p.texto} disabled={disabled} maxLength={4096} aria-label="Texto"
          placeholder="Hola {nombre} 👋 Nuestro horario es {horario}" onChange={(e) => cambiar({ ...p, texto: e.target.value })} />
      )}
      {p.tipo === 'ficha_equipo' && (
        <EditorFicha p={p} cambiar={cambiar} disabled={disabled} atributos={ctx.atributos} ejemplo={ctx.ejemplo} />
      )}
      {p.tipo === 'asesor' && (
        <input value={p.texto ?? ''} disabled={disabled} placeholder="Motivo que ve el cliente (opcional)" aria-label="Motivo"
          onChange={(e) => cambiar({ ...p, texto: e.target.value })} />
      )}
      <small className="muted">{PASOS.find((x) => x.tipo === p.tipo)?.ayuda}</small>
      {aviso && <small className="accion-aviso">{aviso}</small>}
    </div>
  )
}

function TarjetaAccion({ a, posicion, total, usos, ctx, ocupado, correr }: {
  a: Accion; posicion: number; total: number; usos: number; ctx: Contexto; ocupado: boolean; correr: Correr
}) {
  const [abierta, setAbierta] = useState(false)
  const [nombre, setNombre] = useState(a.nombre)
  const [cuando, setCuando] = useState<Condicion[]>(a.cuando)
  const [hacer, setHacer] = useState<Paso[]>(a.hacer)
  const [frase, setFrase] = useState('')
  const [forma, setForma] = useState<CondicionFrase['forma']>('contiene')
  const cambio = nombre !== a.nombre || JSON.stringify(cuando) !== JSON.stringify(a.cuando) || JSON.stringify(hacer) !== JSON.stringify(a.hacer)
  const lista = a.hacer.length > 0 && a.cuando.length > 0 && a.hacer.every(pasoListo)
  const agregarFrase = () => {
    if (!frase.trim()) return
    setCuando([...cuando, { forma, texto: frase.trim() }])
    setFrase('')
  }

  return (
    <article className={`accion${a.activa ? ' activa' : ''}`}>
      <div className="accion-h">
        <span className="accion-orden mono" title="Orden: gana la primera que coincide">{posicion}</span>
        <button type="button" className="accion-titulo" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>
          <b>{a.nombre}</b>
          <small className="muted">
            Cuando {a.cuando.length ? a.cuando.map((c) => `«${c.texto}»`).slice(0, 4).join(', ') + (a.cuando.length > 4 ? '…' : '') : '— sin frases —'}
            {' → '}{a.hacer.length ? a.hacer.map((p) => PASOS.find((x) => x.tipo === p.tipo)?.texto.toLowerCase()).join(', ') : 'sin pasos'}
          </small>
        </button>
        {a.sistema && <span className="chip neu" title="No se puede apagar, borrar ni mover">Sistema</span>}
        <span className="chip neu" title="Veces que respondió en los últimos 30 días">{usos.toLocaleString('es-CO')} en 30 días</span>
        <label className="check">
          <input type="checkbox" role="switch" className="switch" checked={a.activa}
            disabled={ocupado || a.sistema || (!a.activa && (!lista || cambio))}
            title={!lista ? 'Necesita frases y pasos que ya existan' : undefined}
            onChange={(e) => correr(() => activarAccion(a.id, e.target.checked))} />
          <span>{a.activa ? 'Activa' : 'Apagada'}</span>
        </label>
        {!a.sistema && (
          <span className="accion-mover">
            <button type="button" className="btn chico" disabled={ocupado || posicion <= 2} aria-label="Subir" onClick={() => correr(() => moverAccion(a.id, 'subir'))}>↑</button>
            <button type="button" className="btn chico" disabled={ocupado || posicion >= total} aria-label="Bajar" onClick={() => correr(() => moverAccion(a.id, 'bajar'))}>↓</button>
          </span>
        )}
      </div>

      {abierta && (
        <div className="accion-cuerpo">
          <label className="field">Nombre
            <input value={nombre} disabled={ocupado} onChange={(e) => setNombre(e.target.value)} />
          </label>

          <div>
            <h3 className="sub">Cuando el cliente escribe…</h3>
            <div className="accion-frases">
              {cuando.map((c, i) => (
                <span key={i} className="chip acc accion-frase">
                  {c.forma === 'equipo' ? '🔎 nombra un equipo del inventario' : <>
                    {c.forma !== 'contiene' && <em>{FORMAS.find((f) => f.valor === c.forma)?.texto} </em>}«{c.texto}»</>}
                  <button type="button" disabled={ocupado} aria-label={`Quitar «${c.texto}»`} onClick={() => setCuando(cuando.filter((_, j) => j !== i))}>✕</button>
                </span>
              ))}
              {!cuando.length && <small className="muted">Sin frases todavía.</small>}
            </div>
            {cuando.map((c, i) => c.forma === 'equipo' && (
              <EditorCondicionEquipo key={`e${i}`} c={c} disabled={ocupado} cambiar={(nueva) => setCuando(cuando.map((x, j) => (j === i ? nueva : x)))} />
            ))}
            <div className="inline" style={{ marginTop: 8 }}>
              <select value={forma} disabled={ocupado} aria-label="Forma" onChange={(e) => setForma(e.target.value as CondicionFrase['forma'])}>
                {FORMAS.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}
              </select>
              <input value={frase} disabled={ocupado} placeholder="dónde quedan" aria-label="Frase nueva"
                onChange={(e) => setFrase(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarFrase() } }} />
              <button type="button" className="btn chico" disabled={ocupado || !frase.trim()} onClick={agregarFrase}>Agregar frase</button>
              {!cuando.some((c) => c.forma === 'equipo') && (
                <button type="button" className="btn chico" disabled={ocupado} title="Dispara cuando el mensaje nombra un equipo del inventario (F4·42)"
                  onClick={() => setCuando([...cuando, { ...CONDICION_EQUIPO }])}>+ Nombra un equipo</button>
              )}
            </div>
            <small className="muted">No importan mayúsculas, tildes ni signos. «contiene» busca al inicio de una palabra: «devolución» también encuentra «devoluciones», pero «cambio» no se activa con «intercambio».</small>
          </div>

          <div>
            <h3 className="sub">… hacer, en este orden</h3>
            <div className="accion-pasos">
              {hacer.map((p, i) => (
                <EditorPaso key={i} p={p} ctx={ctx} disabled={ocupado}
                  cambiar={(nuevo) => setHacer(hacer.map((x, j) => (j === i ? nuevo : x)))}
                  quitar={() => setHacer(hacer.filter((_, j) => j !== i))} />
              ))}
            </div>
            <button type="button" className="btn chico" disabled={ocupado} style={{ marginTop: 8 }}
              onClick={() => setHacer([...hacer, pasoVacio('texto')])}>+ Agregar paso</button>
          </div>

          <div className="row">
            <button type="button" className="btn chico primary" disabled={ocupado || !cambio || !nombre.trim()}
              onClick={() => correr(() => guardarAccion(a.id, { nombre, cuando, hacer }))}>Guardar</button>
            {cambio && (
              <button type="button" className="btn chico" disabled={ocupado}
                onClick={() => { setNombre(a.nombre); setCuando(a.cuando); setHacer(a.hacer) }}>Deshacer</button>
            )}
            {!a.sistema && (
              <button type="button" className="btn chico peligro" disabled={ocupado}
                onClick={() => confirm(`¿Borrar la acción «${a.nombre}»?`) && correr(() => borrarAccion(a.id))}>Borrar</button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

function Probar() {
  const [frase, setFrase] = useState('')
  const [cargando, setCargando] = useState(false)
  const [r, setR] = useState<{ error?: string; prueba?: Prueba } | null>(null)
  const p = r?.prueba
  return (
    <section className="panel">
      <div className="panel-h"><div><h2>Probar con una frase</h2><small>Escribe como un cliente. Se usa el mismo motor del bot, sin enviar nada.</small></div></div>
      <form className="panel-b" style={{ display: 'grid', gap: 10 }}
        onSubmit={async (e) => { e.preventDefault(); setCargando(true); setR(await probarFrase(frase)); setCargando(false) }}>
        <div className="inline">
          <input value={frase} onChange={(e) => setFrase(e.target.value)} placeholder="Hola, ¿dónde queda el local?" aria-label="Frase de prueba" style={{ flex: 1 }} />
          <button className="btn primary" disabled={cargando || !frase.trim()}>{cargando ? 'Probando…' : 'Probar'}</button>
        </div>
        {r?.error && <div className="aviso bad">{r.error}</div>}
        {p && !p.accion && (
          <div className="aviso">
            Ninguna acción activa coincide: el mensaje sigue por el menú del bot.
            {p.apagada && <> La acción apagada <b>«{p.apagada.nombre}»</b> coincidiría si estuviera activa.</>}
          </div>
        )}
        {p?.accion && (
          <div className="accion-prueba">
            <div className="aviso ok">Responde la acción <b>«{p.accion.nombre}»</b>{p.etiquetas?.length ? ` · etiqueta ${p.etiquetas.join(', ')}` : ''}.</div>
            {p.vacia && <div className="aviso bad">Pero no tiene nada que enviar (categoría sin fichas activas o sin texto de cuentas): el mensaje seguiría por el menú.</div>}
            {p.equipo && (
              <small className="muted">
                {p.equipo.agotado ? `Encontró «${p.equipo.modelo}», pero está agotado o no existe.` : `Encontró «${p.equipo.modelo}»: ${p.equipo.codigos.join(', ')}.`}
              </small>
            )}
            {p.mensajes.map((m, i) => (
              <div key={i} className="accion-burbuja">
                {m.type === 'text' ? String((m.text as { body: string }).body)
                  : m.type === 'image' ? `🖼 [foto del equipo]\n${String((m.image as { caption?: string }).caption ?? '')}`
                  : m.type === 'archivo' ? `📎 ${String(m.titulo)} (${String(m.archivo).endsWith('.pdf') ? 'PDF' : 'imagen'})`
                    : m.type === 'interactive' ? String(((m.interactive as { body?: { text?: string } }).body?.text) ?? '[mensaje con botones]')
                      : `[${String(m.type)}]`}
              </div>
            ))}
          </div>
        )}
      </form>
    </section>
  )
}

export function Acciones({ acciones, usos, categorias, bots, hayCuentas, atributos, ejemplo }: {
  acciones: Accion[]; usos: Record<number, number>; categorias: Record<string, number>
  bots: { id: number; nombre: string }[]; hayCuentas: boolean; atributos: DatoEquipo[]; ejemplo: EquipoEjemplo | null
}) {
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const [nombre, setNombre] = useState('')
  const ctx: Contexto = { categorias, bots, hayCuentas, atributos, ejemplo }
  const correr: Correr = async (accion) => {
    setOcupado(true)
    const r = await accion()
    setAviso(r)
    setOcupado(false)
    return r
  }
  const activas = acciones.filter((a) => a.activa).length

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Acciones «Cuando → Hacer»</h2>
            <small>
              Cuando el cliente escribe una de las frases (o nombra un equipo del inventario), el bot hace los pasos al instante, sin IA y antes que el menú. Se revisan de arriba
              abajo y gana la primera que coincide. No corren si el chat está con un asesor.
            </small>
          </div>
          <span className={`chip ${activas > 1 ? 'ok' : 'neu'}`}>{activas} de {acciones.length} activas</span>
        </div>
        {(aviso.error || aviso.ok) && (
          <div className="panel-b" style={{ paddingBottom: 0 }}>
            <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
          </div>
        )}
        <div className="accion-lista">
          {acciones.map((a, i) => (
            <TarjetaAccion key={`${a.id}-${a.actualizado_en}-${a.prioridad}-${a.activa}`} a={a} posicion={i + 1} total={acciones.length}
              usos={usos[a.id] ?? 0} ctx={ctx} ocupado={ocupado} correr={correr} />
          ))}
        </div>
        <form className="panel-b inline" style={{ borderTop: '1px solid var(--line)' }}
          onSubmit={(e) => { e.preventDefault(); correr(async () => { const r = await crearAccion(nombre); if (!r.error) setNombre(''); return r }) }}>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la acción nueva (ej. Envíos)" aria-label="Nombre de la acción nueva" style={{ flex: 1 }} />
          <button className="btn" disabled={ocupado || !nombre.trim()}>+ Nueva acción</button>
        </form>
      </section>
      <Probar />
    </>
  )
}
