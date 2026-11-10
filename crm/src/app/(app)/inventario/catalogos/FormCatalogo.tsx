'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Aviso } from '@/components/Aviso'
import { MenuAcciones } from '@/components/MenuAcciones'
import { activarCatalogo, borrarCatalogo, crearCatalogo, modificarCatalogo, usosCatalogo, type Resultado } from '../acciones'

export type CatalogoEditable = { id: number; nombre: string; categoria: string; marca: string; tipo: 'pdf' | 'drive'; archivo: string; url: string; todos: boolean; activo: boolean }
export type OpcionesCatalogo = { categorias: string[]; marcas: string[] }

function Guardar({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus()
  if (editando) return <button className="btn primary" disabled={pending}>{pending ? 'Guardando…' : 'Guardar cambios'}</button>
  return <button className="btn primary" disabled={pending}>{pending ? 'Subiendo…' : 'Agregar catálogo'}</button>
}

const nombreArchivo = (ruta: string) => ruta.replace(/^\d+-/, '')

// Agregar (sin `catalogo`) o Modificar (con `catalogo`, F4·60 RI-12). alCrear: el lienzo lo abre en una ventana y elige el
// catálogo recién creado (F4·12, RF-13). Categoría y marca se eligen de la lista o se escribe una nueva (RI-15).
export function FormCatalogo({ alCrear, catalogo, opciones, alTerminar }: {
  alCrear?: (id: number) => void; catalogo?: CatalogoEditable; opciones?: OpcionesCatalogo; alTerminar?: () => void
} = {}) {
  const editando = !!catalogo
  const [estado, accion] = useFormState<Resultado, FormData>(editando ? modificarCatalogo : crearCatalogo, {})
  const [tipo, setTipo] = useState<'pdf' | 'drive'>(catalogo?.tipo ?? 'pdf')
  const [todos, setTodos] = useState(catalogo?.todos ?? false)
  const form = useRef<HTMLFormElement>(null)
  const listas = useId()
  useEffect(() => {
    if (!estado.ok) return
    if (editando) { alTerminar?.(); return }
    form.current?.reset(); setTipo('pdf'); setTodos(false)
    if (estado.id) alCrear?.(estado.id)
  }, [estado]) // eslint-disable-line react-hooks/exhaustive-deps

  const conPdf = !!catalogo && catalogo.tipo === 'pdf' && !!catalogo.archivo

  return (
    <form ref={form} action={accion} className={editando ? undefined : 'panel'} style={editando ? { display: 'grid', gap: 12 } : undefined}>
      {catalogo
        ? <><h3>Modificar catálogo</h3><input type="hidden" name="id" value={catalogo.id} /></>
        : <div className="panel-h"><div><h2>Agregar catálogo</h2><small>PDF hasta 20 MB o enlace de Google Drive. Categoría y marca son opcionales.</small></div></div>}
      <div className={editando ? undefined : 'panel-b'} style={{ display: 'grid', gap: 12 }}>
        <div className="row">
          <label className="inline"><input type="radio" name="tipo" value="pdf" checked={tipo === 'pdf'} onChange={() => { setTipo('pdf'); setTodos(false) }} /> PDF</label>
          <label className="inline"><input type="radio" name="tipo" value="drive" checked={tipo === 'drive'} onChange={() => setTipo('drive')} /> Enlace de Drive</label>
          {tipo === 'drive' && (
            <label className="inline"><input type="checkbox" name="todos" value="1" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Es la carpeta con todos los catálogos</label>
          )}
        </div>
        <div className="form-panel">
          <label className="field">Nombre<input name="nombre" required placeholder="Portátiles Dell" defaultValue={catalogo?.nombre} /></label>
          {!todos && (
            <label className="field">Categoría
              <input name="categoria" placeholder="Portátiles" defaultValue={catalogo?.categoria} list={opciones ? `${listas}-cat` : undefined} autoComplete="off" />
            </label>
          )}
          {!todos && (
            <label className="field">Marca
              <input name="marca" placeholder="DELL" defaultValue={catalogo?.marca} list={opciones ? `${listas}-mar` : undefined} autoComplete="off" />
            </label>
          )}
          {tipo === 'pdf'
            ? (
              <label className="field">{conPdf ? 'Reemplazar el PDF (opcional)' : 'Archivo PDF'}
                <input type="file" name="pdf" accept="application/pdf" required={!conPdf} />
                {conPdf && <small className="muted">Actual: {nombreArchivo(catalogo!.archivo)}. Si no eliges otro, se queda este.</small>}
              </label>
            )
            : <label className="field">Enlace<input type="url" name="url" required placeholder="https://drive.google.com/…" defaultValue={catalogo?.url} /></label>}
        </div>
        {opciones && (
          <>
            <datalist id={`${listas}-cat`}>{opciones.categorias.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id={`${listas}-mar`}>{opciones.marcas.map((m) => <option key={m} value={m} />)}</datalist>
          </>
        )}
        {editando && <small className="muted">El catálogo conserva su número: los cuadros del bot y las Acciones que lo envían siguen funcionando.</small>}
        <div className="row">
          <Guardar editando={editando} />
          {editando && <button type="button" className="btn" onClick={alTerminar}>Cancelar</button>}
        </div>
        <Aviso resultado={estado} />
      </div>
    </form>
  )
}

// F4·60 (RI-11): Acciones por catálogo — Modificar, Desactivar o Activar, y Eliminar avisando dónde se usa (RI-14).
export function AccionesCatalogo({ catalogo, opciones }: { catalogo: CatalogoEditable; opciones: OpcionesCatalogo }) {
  const [ocupado, iniciar] = useTransition()
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(false)
  const [usos, setUsos] = useState<string[] | null>(null) // null = ventana de eliminar cerrada
  const hacer = (f: () => Promise<Resultado>, despues?: () => void) =>
    iniciar(async () => { const r = await f(); setError(r.error ?? ''); if (!r.error) despues?.() })

  const pedirEliminar = () => iniciar(async () => {
    const r = await usosCatalogo(catalogo.id)
    if (r.error) { setError(r.error); return }
    setError(''); setUsos(r.usos)
  })

  return (
    <div className="row" style={{ justifyContent: 'flex-end' }}>
      {error && <small className="aviso bad">{error}</small>}
      <MenuAcciones etiqueta={`Acciones del catálogo ${catalogo.nombre}`} desactivado={ocupado} acciones={[
        { texto: '✏️ Modificar', onClick: () => setEditando(true) },
        { texto: catalogo.activo ? '⏸ Desactivar' : '▶ Activar', onClick: () => hacer(() => activarCatalogo(catalogo.id, !catalogo.activo)) },
        { texto: '🗑 Eliminar', peligro: true, onClick: pedirEliminar },
      ]} />

      {editando && (
        <div className="modal" onClick={() => setEditando(false)}>
          <div className="modal-box ancho" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Modificar catálogo" style={{ textAlign: 'left' }}>
            <FormCatalogo catalogo={catalogo} opciones={opciones} alTerminar={() => setEditando(false)} />
          </div>
        </div>
      )}

      {usos !== null && (
        <div className="modal" onClick={() => setUsos(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Eliminar catálogo" style={{ textAlign: 'left' }}>
            <h3>¿Eliminar «{catalogo.nombre}»?</h3>
            {usos.length === 0
              ? <p>Ningún cuadro del bot ni ninguna Acción lo envía por su nombre. Se borra para siempre{catalogo.tipo === 'pdf' ? ', con su PDF' : ''}.</p>
              : (
                <>
                  <p>Lo usan:</p>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{usos.map((u) => <li key={u}>{u}</li>)}</ul>
                  <p className="bad">Si lo eliminas, esos cuadros y acciones quedan sin catálogo. Mejor <b>desactívalo</b>: se puede volver a activar.</p>
                </>
              )}
            <div className="row">
              {usos.length > 0 && catalogo.activo && (
                <button className="btn primary" disabled={ocupado} onClick={() => hacer(() => activarCatalogo(catalogo.id, false), () => setUsos(null))}>⏸ Desactivar</button>
              )}
              <button className="btn peligro" disabled={ocupado} onClick={() => hacer(() => borrarCatalogo(catalogo.id), () => setUsos(null))}>
                {usos.length > 0 ? 'Eliminar de todas formas' : 'Eliminar'}
              </button>
              <button className="btn" disabled={ocupado} onClick={() => setUsos(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
