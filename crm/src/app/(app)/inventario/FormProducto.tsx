'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Aviso } from '@/components/Aviso'
import type { Producto } from '@/lib/inventario'
import { guardarProducto, type Resultado } from './acciones'

function Guardar({ nuevo }: { nuevo: boolean }) {
  const { pending } = useFormStatus()
  return <button className="btn primary" disabled={pending}>{pending ? 'Guardando…' : nuevo ? 'Crear equipo' : 'Guardar cambios'}</button>
}

const CAMPOS: { nombre: keyof Producto; texto: string; ejemplo?: string }[] = [
  { nombre: 'categoria', texto: 'Categoría', ejemplo: 'Portatil' },
  { nombre: 'marca', texto: 'Marca', ejemplo: 'DELL' },
  { nombre: 'modelo', texto: 'Modelo', ejemplo: 'LATITUDE 5420' },
  { nombre: 'procesador', texto: 'Procesador', ejemplo: 'Core i5-1145G7' },
  { nombre: 'generacion', texto: 'Generación', ejemplo: '11' },
  { nombre: 'ram', texto: 'RAM', ejemplo: '16GB' },
  { nombre: 'almacenamiento', texto: 'Disco', ejemplo: '256GB NVMe' },
  { nombre: 'estado', texto: 'Estado', ejemplo: 'Usado' },
]

export function FormProducto({ producto, foto }: { producto?: Producto; foto: string | null }) {
  const [estado, accion] = useFormState<Resultado, FormData>(guardarProducto, {})
  const [vista, setVista] = useState<string | null>(foto)
  const [quitar, setQuitar] = useState(false)
  const nuevo = !producto

  return (
    <form action={accion} className="panel">
      <div className="panel-h">
        <div><h2>{nuevo ? 'Nuevo equipo' : `Editar ${producto.codigo}`}</h2>
          <small>El código no cambia después (RI-02). Un equipo no se borra: se deja en stock 0.</small></div>
        <div className="row">
          <Link className="btn chico" href={nuevo ? '/inventario' : `/inventario/${producto.id}`}>Cancelar</Link>
          <Guardar nuevo={nuevo} />
        </div>
      </div>
      {producto && <input type="hidden" name="id" value={producto.id} />}
      <input type="hidden" name="foto_ruta_actual" value={producto?.foto_ruta ?? ''} />
      <input type="hidden" name="quitar_foto" value={quitar ? '1' : ''} />
      <div className="panel-b ficha-cols">
        <div className="ficha-foto">
          <div className="foto-caja">{vista && !quitar ? <img src={vista} alt="Foto del equipo" /> : <span className="muted">Sin foto</span>}</div>
          <label className="btn chico">
            {vista ? 'Cambiar foto' : 'Subir foto'}
            <input type="file" name="foto_archivo" accept="image/jpeg,image/png,image/webp" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setVista(URL.createObjectURL(f)); setQuitar(false) } }} />
          </label>
          {producto?.foto_ruta && !quitar && vista === foto && (
            <button type="button" className="btn chico peligro" onClick={() => setQuitar(true)}>Quitar foto</button>
          )}
          <small className="muted">JPG, PNG o WEBP hasta 5 MB. Es la imagen de la ficha que envía el bot.</small>
        </div>
        <div className="form-panel">
          <label className="field">Código
            <input name="codigo" defaultValue={producto?.codigo} readOnly={!nuevo} required={nuevo} placeholder="100-102-1041" className={nuevo ? '' : 'solo-lectura'} />
          </label>
          {CAMPOS.map((c) => (
            <label key={c.nombre} className="field">{c.texto}
              <input name={c.nombre} defaultValue={producto ? String(producto[c.nombre] ?? '') : c.nombre === 'categoria' ? 'Portatil' : ''} placeholder={c.ejemplo} />
            </label>
          ))}
          <label className="field">Precio de venta
            <input name="precio" inputMode="numeric" defaultValue={producto ? Math.round(producto.precio) : ''} required placeholder="1450000" />
          </label>
          <label className="field">Stock
            <input name="stock" type="number" min={0} step={1} defaultValue={producto?.stock ?? 1} required />
          </label>
          <label className="field span-2">Enlace del video
            <input name="video" type="url" defaultValue={producto?.video} placeholder="https://drive.google.com/…" />
          </label>
          <label className="field span-3">Descripción
            <input name="descripcion" defaultValue={producto?.descripcion} placeholder="Detalle del inventario: batería, pantalla, teclado…" />
          </label>
        </div>
      </div>
      <div className="panel-b" style={{ paddingTop: 0 }}><Aviso resultado={estado} /></div>
    </form>
  )
}
