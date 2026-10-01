'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { medir } from '@/lib/bot'
import { FormCatalogo } from '../inventario/catalogos/FormCatalogo'
import { borrarCuadro, guardarCatalogo, type Resultado } from './acciones'
import type { Cuadro } from './Lienzo'
import { VistaWhatsApp } from './VistaWhatsApp'

export type CatalogoOpcion = { id: number; nombre: string; tipo: 'pdf' | 'drive'; activo: boolean; categoria: string; marca: string }

// Panel del cuadro Catálogos (F4·12, RF-12 y RF-13): encabezado, catálogo de Inventario → Catálogos y a dónde sigue.
export function PanelCatalogo({ bot, cuadro, destinos, catalogos, puedeSubir, editable, alTerminar }: {
  bot: number
  cuadro: Cuadro
  destinos: Cuadro[]
  catalogos: CatalogoOpcion[]
  puedeSubir: boolean // también tiene administrar_inventario (RF-13)
  editable: boolean
  alTerminar: (r: Resultado, borrado?: boolean) => void
}) {
  const router = useRouter()
  const [nombre, setNombre] = useState(cuadro.nombre)
  const [texto, setTexto] = useState(cuadro.texto)
  const [catalogo, setCatalogo] = useState(String(cuadro.ajustes?.catalogo_id ?? ''))
  const [siguiente, setSiguiente] = useState<string | null>(cuadro.salidas?.siguiente ?? null)
  const [subiendo, setSubiendo] = useState(false)
  const [ocupado, iniciar] = useTransition()
  const medida = medir(texto, 'texto', [], [])
  const elegido = catalogos.find((c) => String(c.id) === catalogo)
  const para = (c: CatalogoOpcion) => [c.categoria, c.marca].filter(Boolean).join(' · ')

  function guardar() {
    iniciar(async () => {
      alTerminar(await guardarCatalogo(bot, cuadro.clave, nombre, texto, catalogo ? Number(catalogo) : null, siguiente))
    })
  }

  return (
    <div className="lienzo-panel">
      <div className="lienzo-panel-h">
        <div><b>{cuadro.nombre}</b><small className="muted"> · {cuadro.clave}</small></div>
        <small className="muted">📚 Catálogos</small>
      </div>
      {!editable && <div className="aviso">Estás viendo la versión publicada. Para cambiar el flujo, abre un borrador.</div>}
      <small className="muted">Envía el encabezado y el catálogo, y sigue en el acto al cuadro de «Siguiente».</small>
      {editable && (
        <label className="field">Nombre en el lienzo<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} /></label>
      )}
      <label className="field">Encabezado
        <textarea rows={3} value={texto} disabled={!editable || ocupado} placeholder="Catálogos de la marca Lenovo 💻"
          onChange={(e) => setTexto(e.target.value)} />
        <span className="row contador">
          <small className="muted">*negrita* · _cursiva_ · ~tachado~</small>
          <small className={`mono ${medida.largo > medida.limite ? 'bad' : 'muted'}`}>
            {medida.largo.toLocaleString('es-CO')} / {medida.limite.toLocaleString('es-CO')}
          </small>
        </span>
      </label>
      <label className="field">Catálogo
        <select value={catalogo} disabled={!editable || ocupado} onChange={(e) => setCatalogo(e.target.value)}>
          <option value="">— elige un catálogo —</option>
          {catalogos.filter((c) => c.activo || String(c.id) === catalogo).map((c) => (
            <option key={c.id} value={c.id}>
              {c.tipo === 'pdf' ? '📄' : '🔗'} {c.nombre}{para(c) ? ` (${para(c)})` : ''}{c.activo ? '' : ' — desactivado'}
            </option>
          ))}
        </select>
        {catalogo && !elegido && <small className="bad">Ese catálogo ya no existe: elige otro.</small>}
        {elegido && !elegido.activo && <small className="bad">Está desactivado: actívalo en Inventario → Catálogos o elige otro.</small>}
        {!catalogos.some((c) => c.activo) && <small className="muted">Aún no hay catálogos activos.</small>}
      </label>
      {editable && (puedeSubir
        ? <button type="button" className="btn chico" disabled={ocupado} onClick={() => setSubiendo(true)}>+ Subir catálogo</button>
        : <small className="muted">Para subir uno nuevo hace falta el permiso de Inventario (Inventario → Catálogos).</small>)}
      <label className="field">Siguiente
        <select value={siguiente ?? ''} disabled={!editable || ocupado} onChange={(e) => setSiguiente(e.target.value || null)}>
          <option value="">— sin destino —</option>
          {destinos.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
        </select>
      </label>
      <div className="lienzo-vista">
        <strong>Así lo ve el cliente</strong>
        <VistaWhatsApp cuerpo={elegido?.tipo === 'drive' ? `${texto}\n\n📚 *${elegido.nombre}*\n(enlace de Drive)` : texto} forma="texto" opciones={[]} />
        {elegido?.tipo === 'pdf' && <div className="wa"><div className="wa-burbuja"><div className="wa-texto">📄 <b>{elegido.nombre}</b> (catálogo PDF)</div></div></div>}
      </div>
      {editable && (
        <div className="row">
          <button className="btn primary" data-guardar disabled={ocupado || !texto.trim() || medida.largo > medida.limite} onClick={guardar}>
            {ocupado ? 'Guardando…' : 'Guardar en el borrador'}
          </button>
          <button className="btn peligro" data-guardar disabled={ocupado}
            onClick={() => confirm(`¿Borrar el cuadro ${cuadro.nombre} del borrador? Las flechas que llegan quedan sueltas.`)
              && iniciar(async () => alTerminar(await borrarCuadro(bot, cuadro.clave), true))}>Borrar cuadro</button>
        </div>
      )}
      {subiendo && (
        <div className="modal" onClick={() => setSubiendo(false)}>
          <div className="modal-box ancho" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Subir catálogo">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>Subir catálogo</h3>
              <button type="button" className="btn chico" onClick={() => setSubiendo(false)}>Cerrar</button>
            </div>
            <FormCatalogo alCrear={(id) => { setCatalogo(String(id)); setSubiendo(false); router.refresh() }} />
          </div>
        </div>
      )}
    </div>
  )
}
