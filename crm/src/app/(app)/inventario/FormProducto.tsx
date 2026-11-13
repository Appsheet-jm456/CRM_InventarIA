'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Aviso } from '@/components/Aviso'
import { aplicaA, rutaArchivo, type AtributoProducto, type Producto } from '@/lib/inventario'
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

// Un campo por atributo activo (F4·41, RI-08). Se llama atr_<clave>; vacío borra el dato.
function CampoAtributo({ a, valor }: { a: AtributoProducto; valor: unknown }) {
  const nombre = `atr_${a.clave}`
  const etiqueta = `${a.emoji ? `${a.emoji} ` : ''}${a.nombre}`
  if (a.tipo === 'si_no')
    return (
      <label className="field">{etiqueta}
        <select name={nombre} defaultValue={valor === true ? 'si' : valor === false ? 'no' : ''}>
          <option value="">—</option><option value="si">Sí</option><option value="no">No</option>
        </select>
      </label>
    )
  if (a.tipo === 'lista')
    return (
      <label className="field">{etiqueta}
        <select name={nombre} defaultValue={typeof valor === 'string' ? valor : ''}>
          <option value="">—</option>
          {a.opciones.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
    )
  return (
    <label className="field">{etiqueta}
      <input name={nombre} defaultValue={valor === null || valor === undefined ? '' : String(valor)} maxLength={300}
        inputMode={a.tipo === 'numero' ? 'decimal' : undefined} />
    </label>
  )
}

// Una casilla de foto (F4·65, RI-12): vista previa, subir o cambiar y quitar. La 1 es la principal de la ficha.
function CasillaFoto({ n, actual, guardada }: { n: number; actual: string | null; guardada: boolean }) {
  const [vista, setVista] = useState<string | null>(actual)
  const [quitar, setQuitar] = useState(false)
  const sufijo = n === 1 ? '' : `_${n}`
  return (
    <div className="casilla-foto">
      <small className="muted">{n === 1 ? 'Foto 1 · principal' : `Foto ${n}`}</small>
      <div className="foto-caja">{vista && !quitar ? <img src={vista} alt={`Foto ${n} del equipo`} /> : <span className="muted">Sin foto</span>}</div>
      <input type="hidden" name={`quitar_foto${sufijo}`} value={quitar ? '1' : ''} />
      <div className="row">
        <label className="btn chico">
          {vista && !quitar ? 'Cambiar' : 'Subir'}
          <input type="file" name={`foto_archivo${sufijo}`} accept="image/jpeg,image/png" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setVista(URL.createObjectURL(f)); setQuitar(false) } }} />
        </label>
        {guardada && !quitar && vista === actual && (
          <button type="button" className="btn chico peligro" onClick={() => setQuitar(true)}>Quitar</button>
        )}
      </div>
    </div>
  )
}

export function FormProducto({ producto, foto, atributos }: { producto?: Producto; foto: string | null; atributos: AtributoProducto[] }) {
  const [estado, accion] = useFormState<Resultado, FormData>(guardarProducto, {})
  const nuevo = !producto
  const [categoria, setCategoria] = useState(producto?.categoria ?? 'Portatil')
  const visibles = atributos.filter((a) => aplicaA(a, categoria))

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
      <div className="panel-b ficha-cols">
        <div className="ficha-foto">
          <CasillaFoto n={1} actual={foto} guardada={!!producto?.foto_ruta} />
          {[2, 3].map((n) => {
            const ruta = producto?.fotos_extra?.[n - 2]
            return <CasillaFoto key={n} n={n} actual={ruta ? rutaArchivo('productos', ruta) : null} guardada={!!ruta} />
          })}
          <small className="muted">Hasta 3 fotos JPG o PNG de 5 MB (WhatsApp no envía WEBP). La 1 va en la ficha; la 2 y la 3 salen después.</small>
        </div>
        <div className="form-panel">
          <label className="field">Código
            <input name="codigo" defaultValue={producto?.codigo} readOnly={!nuevo} required={nuevo} placeholder="100-102-1041" className={nuevo ? '' : 'solo-lectura'} />
          </label>
          {CAMPOS.map((c) => (
            <label key={c.nombre} className="field">{c.texto}
              <input name={c.nombre} defaultValue={producto ? String(producto[c.nombre] ?? '') : c.nombre === 'categoria' ? 'Portatil' : ''} placeholder={c.ejemplo}
                onChange={c.nombre === 'categoria' ? (e) => setCategoria(e.target.value) : undefined} />
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
          <label className="field">Carpeta de fotos en Drive
            <input name="fotos_drive" type="url" defaultValue={producto?.fotos_drive} placeholder="https://drive.google.com/drive/folders/…" />
          </label>
          <label className="field span-2">🌐 Enlace en la tienda web
            <input name="enlace_web" type="url" defaultValue={producto?.enlace_web}
              placeholder={`https://ventasvirtualcolombia.com/producto/${producto?.codigo || 'código'}`} />
            <small className="muted">Opcional. Vacío: el bot lo busca solo en la tienda por el código. Escrito: se envía siempre este.</small>
          </label>
          <label className="field span-3">Descripción
            <input name="descripcion" defaultValue={producto?.descripcion} placeholder="Detalle del inventario: batería, pantalla, teclado…" />
          </label>
          {visibles.length > 0 && (
            <>
              <h3 className="sub span-3" style={{ margin: '4px 0 0' }}>Atributos</h3>
              {visibles.map((a) => <CampoAtributo key={a.id} a={a} valor={producto?.atributos?.[a.clave]} />)}
              <input type="hidden" name="atributos_formulario" value={visibles.map((a) => a.clave).join(',')} />
            </>
          )}
        </div>
      </div>
      <div className="panel-b" style={{ paddingTop: 0 }}><Aviso resultado={estado} /></div>
    </form>
  )
}
