'use client'

import { useState, useTransition } from 'react'
import { borrarCuadro, guardarCondiciones, type Resultado } from './acciones'
import type { Cuadro } from './Lienzo'

type Condicion = { titulo: string; palabras: string[]; destino: string | null }

// Como compara el bot (flujo.normalizar_condicion) y como lo guarda la base: minúsculas, sin tildes ni signos.
export const normalizarCondicion = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}\s_]/gu, '').replace(/\s+/g, ' ').trim()

// RF-11: estas se atienden antes que las condiciones, así que una condición con ellas nunca se cumpliría.
function chocaConReglas(p: string) {
  if (['0', '9', 'hola', 'menu', 'inicio', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'reiniciar'].includes(p)) return true
  return p.includes('asesor')
}

// Panel del cuadro Condiciones (F4·11, RF-10): condiciones en orden, cada una "es igual a" una o varias palabras.
export function PanelCondiciones({ bot, cuadro, destinos, editable, alTerminar }: {
  bot: number
  cuadro: Cuadro
  destinos: Cuadro[]
  editable: boolean
  alTerminar: (r: Resultado, borrado?: boolean) => void
}) {
  const [nombre, setNombre] = useState(cuadro.nombre)
  const [condiciones, setCondiciones] = useState<Condicion[]>(
    (cuadro.opciones ?? []).map((o) => ({ titulo: o.titulo, palabras: o.palabras ?? [], destino: o.destino ?? null })))
  const [ninguna, setNinguna] = useState<string | null>(cuadro.salidas?.ninguna ?? null)
  const [escribiendo, setEscribiendo] = useState<Record<number, string>>({})
  const [ocupado, iniciar] = useTransition()

  const cambiar = (i: number, cambio: Partial<Condicion>) => setCondiciones((cs) => cs.map((c, j) => (j === i ? { ...c, ...cambio } : c)))
  const mover = (i: number, d: number) => setCondiciones((cs) => {
    const n = [...cs]
    ;[n[i], n[i + d]] = [n[i + d], n[i]]
    return n
  })
  // Lo que quedó escrito en la caja se agrega como palabra (separadas por coma o Enter).
  const conEscrito = (cs: Condicion[]) => cs.map((c, i) => {
    const nuevas = (escribiendo[i] ?? '').split(',').map(normalizarCondicion).filter(Boolean)
    return { ...c, palabras: [...c.palabras, ...nuevas.filter((p) => !c.palabras.includes(p))] }
  })
  function agregarPalabras(i: number) {
    setCondiciones((cs) => conEscrito(cs).map((c, j) => (j === i ? c : cs[j])))
    setEscribiendo((e) => ({ ...e, [i]: '' }))
  }

  const todas = conEscrito(condiciones)
  const repetidas = todas.flatMap((c) => c.palabras).filter((p, i, a) => a.indexOf(p) !== i)
  const chocan = [...new Set(todas.flatMap((c) => c.palabras).filter(chocaConReglas))]
  const bloqueado = !todas.length || todas.some((c) => !c.titulo.trim()) || repetidas.length > 0

  function guardar() {
    iniciar(async () => {
      setEscribiendo({})
      alTerminar(await guardarCondiciones(bot, cuadro.clave, nombre, todas, ninguna))
    })
  }

  return (
    <div className="lienzo-panel">
      <div className="lienzo-panel-h">
        <div><b>{cuadro.nombre}</b><small className="muted"> · {cuadro.clave}</small></div>
        <small className="muted">🔀 Condiciones</small>
      </div>
      {!editable && <div className="aviso">Estás viendo la versión publicada. Para cambiar el flujo, abre un borrador.</div>}
      <small className="muted">
        No envía nada: compara el <b>último mensaje del cliente</b> con cada condición, en orden, y sigue por la primera que se
        cumpla. Si el cliente tocó un botón, compara el título de esa opción. No importan mayúsculas, tildes ni signos.
      </small>
      {editable && (
        <label className="field">Nombre en el lienzo<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} /></label>
      )}
      <div className="condiciones">
        {condiciones.map((c, i) => (
          <div key={i} className="condicion">
            <div className="row condicion-h">
              <span className="chip neu">{i + 1}</span>
              <input value={c.titulo} disabled={!editable || ocupado} maxLength={40} aria-label={`Nombre de la condición ${i + 1}`}
                placeholder="Hablar con asesor" onChange={(e) => cambiar(i, { titulo: e.target.value })} />
              {editable && (
                <span className="row">
                  <button type="button" className="btn chico" disabled={ocupado || i === 0} aria-label="Subir" onClick={() => mover(i, -1)}>↑</button>
                  <button type="button" className="btn chico" disabled={ocupado || i === condiciones.length - 1} aria-label="Bajar" onClick={() => mover(i, 1)}>↓</button>
                  <button type="button" className="btn chico peligro" disabled={ocupado || condiciones.length === 1} aria-label={`Quitar condición ${i + 1}`}
                    onClick={() => setCondiciones(condiciones.filter((_, j) => j !== i))}>×</button>
                </span>
              )}
            </div>
            <div className="condicion-palabras">
              <small className="muted">Si el mensaje es igual a</small>
              {c.palabras.map((p) => (
                <span key={p} className={`chip ${repetidas.includes(p) || chocaConReglas(p) ? 'warn' : 'acc'}`}>
                  {p}
                  {editable && <button type="button" className="enlace" aria-label={`Quitar ${p}`} disabled={ocupado}
                    onClick={() => cambiar(i, { palabras: c.palabras.filter((x) => x !== p) })}> ×</button>}
                </span>
              ))}
              {editable && (
                <input value={escribiendo[i] ?? ''} disabled={ocupado} aria-label={`Palabras de la condición ${i + 1}`}
                  placeholder={c.palabras.length ? 'otra…' : 'ayuda, 1, uno…'}
                  onChange={(e) => setEscribiendo({ ...escribiendo, [i]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); agregarPalabras(i) } }}
                  onBlur={() => agregarPalabras(i)} />
              )}
            </div>
            <label className="field">Lleva a
              <select value={c.destino ?? ''} disabled={!editable || ocupado} aria-label={`Destino de la condición ${i + 1}`}
                onChange={(e) => cambiar(i, { destino: e.target.value || null })}>
                <option value="">— sin destino —</option>
                {destinos.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
              </select>
            </label>
          </div>
        ))}
        {editable && condiciones.length < 10 && (
          <button type="button" className="btn chico" disabled={ocupado}
            onClick={() => setCondiciones([...condiciones, { titulo: `Condición ${condiciones.length + 1}`, palabras: [], destino: null }])}>+ Condición</button>
        )}
      </div>
      <label className="field">Ninguna se cumple, sigue a
        <select value={ninguna ?? ''} disabled={!editable || ocupado} onChange={(e) => setNinguna(e.target.value || null)}>
          <option value="">— sin destino —</option>
          {destinos.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
        </select>
      </label>
      {repetidas.length > 0 && <div className="aviso bad">«{repetidas.join('», «')}» está en dos condiciones: solo ganaría la primera.</div>}
      {chocan.length > 0 && (
        <div className="aviso warn">
          «{chocan.join('», «')}»: el bot lo atiende antes que las condiciones (9 o «asesor» pasan a un asesor; 0, «hola» y «menú» vuelven
          al inicio; «reiniciar» reinicia). Esa condición nunca se cumpliría con esa palabra.
        </div>
      )}
      {editable && (
        <div className="row">
          <button className="btn primary" data-guardar disabled={ocupado || bloqueado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar en el borrador'}</button>
          <button className="btn peligro" data-guardar disabled={ocupado}
            onClick={() => confirm(`¿Borrar el cuadro ${cuadro.nombre} del borrador? Las flechas que llegan quedan sueltas.`)
              && iniciar(async () => alTerminar(await borrarCuadro(bot, cuadro.clave), true))}>Borrar cuadro</button>
        </div>
      )}
    </div>
  )
}
