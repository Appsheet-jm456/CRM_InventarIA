'use client'

import Link from 'next/link'
import { useState } from 'react'
import { medir, revisarMarcas, type Formato, type Opcion } from '@/lib/bot'
import { guardarNodo, restaurarNodo, type Resultado } from './acciones'
import { VistaWhatsApp } from './VistaWhatsApp'

type Nodo = {
  clave: string
  nombre: string
  texto: string
  opciones: Opcion[] | null
  texto_original: string
  opciones_original: Opcion[] | null
  max_titulo: number | null
  marcas: string[]
  formato: Formato
  opciones_codigo: Opcion[] | null
  actualizado_en: string
}

export type Contexto = { horario: string; ficha: string }

const AYUDA: Record<string, string> = {
  uso: 'el tipo de trabajo que eligió el cliente',
  motivo: 'la razón del paso a asesor, si el bot tiene una',
  horario: 'el horario de la pestaña Horario y festivos',
  proxima: 'cuándo le responden (hoy, mañana o el próximo día hábil)',
}

const FALTA: Record<string, string> = {
  uso: 'el cliente no verá el tipo de trabajo que eligió.',
  motivo: 'si el bot pasa a asesor por una razón (por ejemplo, una opción que aún no existe), el cliente no la verá.',
  horario: 'el cliente no verá el horario de atención.',
  proxima: 'el cliente no sabrá cuándo le responden.',
}

function vistaPrevia(texto: string, marcas: string[], contexto: Contexto) {
  const ejemplos: Record<string, string> = { uso: 'Diseño', motivo: '', horario: contexto.horario, proxima: 'mañana a las 8:00 am' }
  let t = texto
  for (const m of marcas) t = t.replaceAll(`{${m}}`, ejemplos[m] ?? '')
  return t
}

const esIgual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export const editado = (n: Pick<Nodo, 'texto' | 'texto_original' | 'opciones' | 'opciones_original'>) =>
  n.texto !== n.texto_original || !esIgual(n.opciones, n.opciones_original)

function Editor({ nodo, contexto }: { nodo: Nodo; contexto: Contexto }) {
  const [texto, setTexto] = useState(nodo.texto)
  const [opciones, setOpciones] = useState<Opcion[] | null>(nodo.opciones)
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const limite = nodo.max_titulo ?? 24
  const ficha = nodo.formato === 'ficha'
  const sinCambios = texto === nodo.texto && esIgual(opciones, nodo.opciones)
  const igualOriginal = texto === nodo.texto_original && esIgual(opciones, nodo.opciones_original)
  const pasado = (opciones ?? []).some((o) => o.titulo.length > limite || !o.titulo.trim())
  const todas = opciones ?? nodo.opciones_codigo ?? []
  const medida = medir(texto, nodo.formato, todas, nodo.marcas)
  const largoPasado = medida.largo > medida.limite
  const { desconocidas, faltantes } = revisarMarcas(texto, nodo.marcas)
  const bloqueado = pasado || largoPasado || desconocidas.length > 0 || !texto.trim()

  async function correr(accion: () => Promise<Resultado>) {
    setOcupado(true)
    setAviso(await accion())
    setOcupado(false)
  }

  return (
    <div className="panel-b editor-bot">
      <div className="editor-bot-campos">
        {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}
        {ficha ? (
          <div className="aviso">La ficha sale del inventario (foto, equipo, precio y stock). Aquí solo se editan sus botones.</div>
        ) : (
          <label className="field">
            {nodo.formato === 'motivo' ? 'Frase (va dentro del aviso de paso a asesor)' : 'Mensaje'}
            <textarea rows={Math.min(12, Math.max(3, texto.split('\n').length + 1))} value={texto} disabled={ocupado} onChange={(e) => setTexto(e.target.value)} />
            <span className="row contador">
              <small className="muted">En WhatsApp, *así* se ve en negrita, _así_ en cursiva y ~así~ tachado.</small>
              <small className={`mono ${largoPasado ? 'bad' : medida.largo > medida.limite * 0.9 ? 'warn' : 'muted'}`}
                title="Cuenta las opciones numeradas y el valor más largo de cada marca, como lo envía el bot">
                {medida.largo.toLocaleString('es-CO')} / {medida.limite.toLocaleString('es-CO')}
                {medida.forma === 'botones' ? ' con botones' : medida.forma === 'lista' ? ' con lista' : ''}
              </small>
            </span>
          </label>
        )}
        {largoPasado && (
          <div className="aviso bad" role="alert">
            WhatsApp no deja enviar más de {medida.limite.toLocaleString('es-CO')} caracteres {medida.forma === 'botones' ? 'en un mensaje con botones' : 'en este mensaje'}
            {medida.forma === 'botones' ? ' (el texto cuenta junto con las opciones numeradas)' : ''}. Acórtalo para poder guardar.
          </div>
        )}
        {desconocidas.length > 0 && (
          <div className="aviso bad" role="alert">
            El bot no reemplaza {desconocidas.map((m) => `{${m}}`).join(', ')}: el cliente lo vería tal cual.{' '}
            {nodo.marcas.length ? `Marcas de este mensaje: ${nodo.marcas.map((m) => `{${m}}`).join(', ')}.` : 'Este mensaje no usa marcas.'}
          </div>
        )}
        {faltantes.map((m) => <div key={m} className="aviso warn">Quitaste <code>{`{${m}}`}</code>: {FALTA[m] ?? 'el bot no pondrá ese dato.'}</div>)}
        {nodo.marcas.length > 0 && (
          <small className="muted">
            Marcas que el bot reemplaza:{' '}
            {nodo.marcas.map((m) => <span key={m} style={{ marginRight: 8 }}><code>{`{${m}}`}</code>{AYUDA[m] ? ` = ${AYUDA[m]}` : ''}</span>)}
          </small>
        )}
        {opciones && (
          <div style={{ display: 'grid', gap: 8 }}>
            <strong>Opciones</strong>
            {opciones.map((o, i) => (
              <label key={o.id} className="field" style={{ gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', display: 'grid', gap: 8 }}>
                <span className="chip neu">{o.id}️⃣</span>
                <input value={o.titulo} disabled={ocupado} maxLength={40}
                  onChange={(e) => setOpciones(opciones.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} />
                <small className={o.titulo.length > limite ? 'bad' : 'muted'}>{o.titulo.length}/{limite}</small>
              </label>
            ))}
            <small className="muted">
              El bot reconoce la opción por su número, así que cambiar el título no rompe nada. Máximo {limite} caracteres.
              {nodo.clave !== 'R11' && ' Con hasta 3 opciones de 20 caracteres o menos salen como botones; si no, como lista.'}
            </small>
          </div>
        )}
        {!opciones && nodo.opciones_codigo && (
          <small className="muted">Las opciones de este mensaje las pone el bot ({nodo.clave === 'B001A4' ? 'las marcas con stock' : 'los rangos de presupuesto'}); aquí se edita solo la pregunta.</small>
        )}
        <div className="inline">
          <button className="btn primary" disabled={ocupado || sinCambios || bloqueado} onClick={() => correr(() => guardarNodo(nodo.clave, texto, opciones))}>
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
      <div className="editor-bot-vista">
        <strong>Así lo ve el cliente</strong>
        <VistaWhatsApp
          cuerpo={ficha ? contexto.ficha : nodo.formato === 'motivo'
            ? vistaPrevia(`_${texto}_\n\n¡Entendido! 🙌 En breve un asesor te atenderá personalmente.`, [], contexto)
            : vistaPrevia(texto, nodo.marcas, contexto)}
          forma={ficha ? 'botones' : medida.forma}
          opciones={ficha ? (opciones ?? []) : nodo.formato === 'menu' ? todas : []} numerar={!ficha} />
        {nodo.formato === 'motivo' && <small className="muted">Así aparece dentro del aviso de paso a asesor.</small>}
        {nodo.marcas.length > 0 && <small className="muted">Con valores de ejemplo; el horario es el de la pestaña Horario y festivos.</small>}
      </div>
    </div>
  )
}

export function Mensajes({ nodos, actual, contexto }: { nodos: Nodo[]; actual?: string; contexto: Contexto }) {
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
          <Link key={n.clave} href={`/bot?n=${n.clave}`} className={`pastilla${n.clave === nodo?.clave ? ' activa' : ''}`}>
            {n.nombre}{editado(n) && <span className="punto-editado" title="Editado: distinto del original" aria-label="(editado)" />}
          </Link>
        ))}
      </div>
      {nodo && <Editor key={nodo.clave + nodo.actualizado_en} nodo={nodo} contexto={contexto} />}
    </section>
  )
}
