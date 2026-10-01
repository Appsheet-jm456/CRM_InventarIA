'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Aviso } from '@/components/Aviso'
import { activarCatalogo, borrarCatalogo, crearCatalogo, type Resultado } from '../acciones'

function Agregar() {
  const { pending } = useFormStatus()
  return <button className="btn primary" disabled={pending}>{pending ? 'Subiendo…' : 'Agregar catálogo'}</button>
}

// alCrear: el lienzo lo abre en una ventana y elige el catálogo recién creado (F4·12, RF-13).
export function FormCatalogo({ alCrear }: { alCrear?: (id: number) => void } = {}) {
  const [estado, accion] = useFormState<Resultado, FormData>(crearCatalogo, {})
  const [tipo, setTipo] = useState<'pdf' | 'drive'>('pdf')
  const [todos, setTodos] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (!estado.ok) return
    form.current?.reset(); setTipo('pdf'); setTodos(false)
    if (estado.id) alCrear?.(estado.id)
  }, [estado]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form ref={form} action={accion} className="panel">
      <div className="panel-h"><div><h2>Agregar catálogo</h2><small>PDF hasta 20 MB o enlace de Google Drive. Categoría y marca son opcionales.</small></div></div>
      <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
        <div className="row">
          <label className="inline"><input type="radio" name="tipo" value="pdf" checked={tipo === 'pdf'} onChange={() => { setTipo('pdf'); setTodos(false) }} /> PDF</label>
          <label className="inline"><input type="radio" name="tipo" value="drive" checked={tipo === 'drive'} onChange={() => setTipo('drive')} /> Enlace de Drive</label>
          {tipo === 'drive' && (
            <label className="inline"><input type="checkbox" name="todos" value="1" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Es la carpeta con todos los catálogos</label>
          )}
        </div>
        <div className="form-panel">
          <label className="field">Nombre<input name="nombre" required placeholder="Portátiles Dell" /></label>
          {!todos && <label className="field">Categoría<input name="categoria" placeholder="Portátiles" /></label>}
          {!todos && <label className="field">Marca<input name="marca" placeholder="DELL" /></label>}
          {tipo === 'pdf'
            ? <label className="field">Archivo PDF<input type="file" name="pdf" accept="application/pdf" required /></label>
            : <label className="field">Enlace<input type="url" name="url" required placeholder="https://drive.google.com/…" /></label>}
        </div>
        <div className="row"><Agregar /></div>
        <Aviso resultado={estado} />
      </div>
    </form>
  )
}

export function AccionesCatalogo({ id, activo, nombre }: { id: number; activo: boolean; nombre: string }) {
  const [ocupado, iniciar] = useTransition()
  const [error, setError] = useState('')
  const hacer = (f: () => Promise<Resultado>) => iniciar(async () => setError((await f()).error ?? ''))
  return (
    <div className="row" style={{ justifyContent: 'flex-end' }}>
      {error && <small className="aviso bad">{error}</small>}
      <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => activarCatalogo(id, !activo))}>{activo ? 'Desactivar' : 'Activar'}</button>
      <button className="btn chico peligro" disabled={ocupado}
        onClick={() => confirm(`¿Borrar el catálogo ${nombre}? El bot deja de enviarlo.`) && hacer(() => borrarCatalogo(id))}>Borrar</button>
    </div>
  )
}
