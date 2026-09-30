'use client'

import Link from 'next/link'
import { useState } from 'react'
import { guardarNodo, restaurarNodo, type Opcion, type Resultado } from './acciones'

type Nodo = {
  clave: string
  nombre: string
  texto: string
  opciones: Opcion[] | null
  texto_original: string
  opciones_original: Opcion[] | null
  max_titulo: number | null
  marcas: string[]
  actualizado_en: string
}

const EJEMPLOS: Record<string, string> = {
  uso: 'Diseño',
  motivo: '',
  horario: '🕗 Lunes a viernes: 8:00 am – 6:00 pm\n🕗 Sábados: 9:00 am – 2:00 pm\nFestivos: cerrado.',
  proxima: 'el lunes a las 8:00 am',
}

const AYUDA: Record<string, string> = {
  uso: 'el tipo de trabajo que eligió el cliente',
  motivo: 'la razón del paso a asesor, si el bot tiene una',
  horario: 'el horario de la pestaña Horario y festivos',
  proxima: 'cuándo le responden (hoy, mañana o el próximo día hábil)',
}

function vistaPrevia(texto: string, marcas: string[]) {
  let t = texto
  for (const m of marcas) t = t.replaceAll(`{${m}}`, EJEMPLOS[m] ?? '')
  return t
}

function Editor({ nodo }: { nodo: Nodo }) {
  const [texto, setTexto] = useState(nodo.texto)
  const [opciones, setOpciones] = useState<Opcion[] | null>(nodo.opciones)
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const limite = nodo.max_titulo ?? 24
  const sinCambios = texto === nodo.texto && JSON.stringify(opciones) === JSON.stringify(nodo.opciones)
  const igualOriginal = texto === nodo.texto_original && JSON.stringify(opciones) === JSON.stringify(nodo.opciones_original)
  const pasado = (opciones ?? []).some((o) => o.titulo.length > limite || !o.titulo.trim())

  async function correr(accion: () => Promise<Resultado>) {
    setOcupado(true)
    setAviso(await accion())
    setOcupado(false)
  }

  return (
    <div className="panel-b" style={{ display: 'grid', gap: 14 }}>
      {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}
      <label className="field">
        Mensaje
        <textarea rows={Math.min(10, Math.max(3, texto.split('\n').length + 1))} value={texto} disabled={ocupado} onChange={(e) => setTexto(e.target.value)} />
        <small className="muted">
          En WhatsApp, *así* se ve en negrita y _así_ en cursiva. {nodo.clave === 'R11' && 'La ficha del equipo sale del inventario; aquí solo se editan sus botones.'}
        </small>
      </label>
      {nodo.marcas.length > 0 && (
        <small className="muted">
          Marcas que el bot reemplaza: {nodo.marcas.map((m) => <code key={m} style={{ marginRight: 8 }}>{`{${m}}`}</code>)}
          {nodo.marcas.map((m) => AYUDA[m] && <span key={m} style={{ marginRight: 8 }}>· <code>{`{${m}}`}</code> = {AYUDA[m]}</span>)}
        </small>
      )}
      {opciones && (
        <div style={{ display: 'grid', gap: 8 }}>
          <strong>Opciones</strong>
          {opciones.map((o, i) => (
            <label key={o.id} className="field" style={{ gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', display: 'grid', gap: 8 }}>
              <span className="chip neu">{o.id === '0' ? '0️⃣' : `${o.id}️⃣`}</span>
              <input value={o.titulo} disabled={ocupado} maxLength={40}
                onChange={(e) => setOpciones(opciones.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} />
              <small className={o.titulo.length > limite ? 'bad' : 'muted'}>{o.titulo.length}/{limite}</small>
            </label>
          ))}
          <small className="muted">El bot reconoce la opción por su número, así que cambiar el título no rompe nada. Máximo {limite} caracteres (límite de WhatsApp).</small>
        </div>
      )}
      <div>
        <strong>Así lo ve el cliente</strong>
        <div style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2, #f3f4f6)', borderRadius: 10, padding: 12, marginTop: 6, maxWidth: 520 }}>
          {vistaPrevia(texto, nodo.marcas)}
          {opciones && '\n\n' + opciones.map((o) => `${o.id === '0' ? '0️⃣' : `${o.id}️⃣`} ${o.titulo}`).join('\n')}
        </div>
      </div>
      <div className="inline">
        <button className="btn primary" disabled={ocupado || sinCambios || pasado || !texto.trim()} onClick={() => correr(() => guardarNodo(nodo.clave, texto, opciones))}>
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
        <button className="btn" disabled={ocupado || igualOriginal}
          onClick={() => confirm('¿Volver al texto original de este mensaje?') && correr(async () => {
            const r = await restaurarNodo(nodo.clave)
            if (!r.error) { setTexto(nodo.texto_original); setOpciones(nodo.opciones_original) }
            return r
          })}>
          Restaurar original
        </button>
      </div>
    </div>
  )
}

export function Mensajes({ nodos, actual }: { nodos: Nodo[]; actual?: string }) {
  const nodo = nodos.find((n) => n.clave === actual) ?? nodos[0]
  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>Mensajes del bot</h2>
          <small>Cambias lo que dice y el título de los botones. A dónde lleva cada opción lo define el árbol (decisión 0005, RBOT-01).</small>
        </div>
      </div>
      <div className="embudos-tabs" style={{ padding: '0 16px' }}>
        {nodos.map((n) => (
          <Link key={n.clave} href={`/bot?n=${n.clave}`} className={`pastilla${n.clave === nodo?.clave ? ' activa' : ''}`}>{n.nombre}</Link>
        ))}
      </div>
      {nodo && <Editor key={nodo.clave + nodo.actualizado_en} nodo={nodo} />}
    </section>
  )
}
