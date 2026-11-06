'use client'

import { useState } from 'react'
import { subirArchivoAccion } from './acciones'
import type { PasoArchivo, PasoCatalogo } from './tipos'

export type CatalogoActivo = { id: number; nombre: string; tipo: string; marca: string }
const verArchivo = (ruta: string) => `/archivos/conocimiento/${ruta.split('/').map(encodeURIComponent).join('/')}`

// Paso «Enviar catálogo» (F4·43, RAG-49): uno de la lista, el de la marca del equipo o el Unificado.
export function EditorCatalogo({ p, cambiar, disabled, catalogos }: {
  p: PasoCatalogo; cambiar: (p: PasoCatalogo) => void; disabled: boolean; catalogos: CatalogoActivo[]
}) {
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
      <div className="accion-paso-fila">
        <select value={p.modo} disabled={disabled} aria-label="Qué catálogo" onChange={(e) => cambiar({ ...p, modo: e.target.value as PasoCatalogo['modo'] })}>
          <option value="marca">El de la marca del equipo (o el Unificado)</option>
          <option value="unificado">El Unificado</option>
          <option value="lista">Uno de la lista…</option>
        </select>
        {p.modo === 'lista' && (
          <select value={p.catalogo_id ?? ''} disabled={disabled} aria-label="Catálogo" onChange={(e) => cambiar({ ...p, catalogo_id: Number(e.target.value) })}>
            <option value="" disabled>Elige el catálogo…</option>
            {catalogos.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo === 'pdf' ? 'PDF' : 'Drive'}{c.marca ? ` · ${c.marca}` : ''})</option>)}
          </select>
        )}
      </div>
      <input value={p.texto} disabled={disabled} maxLength={500} aria-label="Texto antes del catálogo" placeholder="Te envío el catálogo de {marca} 📚"
        onChange={(e) => cambiar({ ...p, texto: e.target.value })} />
      <small className="muted">{'{marca}'} es la marca del equipo («nuestros equipos» si no hay una). Un PDF llega como documento; uno de Drive, como enlace en este texto.</small>
    </div>
  )
}

// Paso «Enviar archivo» (F4·43, RAG-50): PDF o imagen subido en la acción, con su texto antes.
export function EditorArchivo({ p, cambiar, disabled }: { p: PasoArchivo; cambiar: (p: PasoArchivo) => void; disabled: boolean }) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  async function subir(archivo: File | undefined) {
    if (!archivo) return
    setSubiendo(true)
    setError('')
    const datos = new FormData()
    datos.set('archivo', archivo)
    const r = await subirArchivoAccion(datos)
    setSubiendo(false)
    if (r.error || !r.ruta) return setError(r.error ?? 'No se pudo subir.')
    cambiar({ ...p, archivo: r.ruta, nombre: p.nombre || r.nombre || 'Archivo' })
  }
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
      <div className="accion-paso-fila">
        <label className="btn chico">
          {subiendo ? 'Subiendo…' : p.archivo ? 'Cambiar archivo' : 'Subir PDF o imagen'}
          <input type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" disabled={disabled || subiendo}
            onChange={(e) => { subir(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {p.archivo && (
          <a className="btn chico" href={verArchivo(p.archivo)} target="_blank" rel="noreferrer">
            {p.archivo.endsWith('.pdf') ? '📄 Ver PDF' : '🖼 Ver imagen'}
          </a>
        )}
      </div>
      <input value={p.nombre} disabled={disabled} maxLength={100} aria-label="Nombre del archivo" placeholder="Ficha técnica HP EliteBook 840"
        onChange={(e) => cambiar({ ...p, nombre: e.target.value })} />
      <small className="muted">El nombre es como le llega el documento al cliente (y el pie de la imagen).</small>
      <input value={p.texto} disabled={disabled} maxLength={1000} aria-label="Texto antes del archivo (opcional)" placeholder="Te comparto la ficha técnica 👇 (opcional)"
        onChange={(e) => cambiar({ ...p, texto: e.target.value })} />
      {error && <small className="accion-aviso">{error}</small>}
      {p.archivo && <small className="muted">Pulsa Guardar para que la acción use este archivo.</small>}
    </div>
  )
}
