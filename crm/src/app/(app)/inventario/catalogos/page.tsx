import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { rutaArchivo } from '@/lib/inventario'
import { Pestanas } from '../Pestanas'
import { AccionesCatalogo, FormCatalogo } from './FormCatalogo'

type Catalogo = { id: number; nombre: string; categoria: string; marca: string; tipo: 'pdf' | 'drive'; archivo: string; url: string; todos: boolean; activo: boolean }

export default async function Catalogos() {
  const sesion = (await obtenerSesion())!
  const administra = puede(sesion, ['administrar_inventario'])
  const { data } = await crearCliente().from('catalogos').select('id, nombre, categoria, marca, tipo, archivo, url, todos, activo').order('todos', { ascending: false }).order('id')
  const catalogos = (data ?? []) as Catalogo[]
  const todos = catalogos.find((c) => c.todos && c.activo)

  return (
    <>
      <Pestanas activa="/inventario/catalogos" administra={administra} />
      <section className="panel">
        <div className="panel-h">
          <div><h2>Catálogos</h2>
            <small>El bot envía el más específico para la marca y categoría que eligió el cliente, si no el general, y siempre el enlace de Drive con todos (decisión 0015).</small></div>
          {!todos && <span className="chip warn">Falta el enlace de Drive con todos</span>}
        </div>
        {catalogos.length === 0 ? (
          <div className="panel-b muted">Todavía no hay catálogos: el bot solo muestra la lista de equipos con stock.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Nombre</th><th>Para</th><th>Tipo</th><th>Estado</th>{administra && <th></th>}</tr></thead>
              <tbody>
                {catalogos.map((c) => (
                  <tr key={c.id}>
                    <td><a href={c.tipo === 'pdf' ? rutaArchivo('catalogos', c.archivo) : c.url} target="_blank" rel="noreferrer">{c.nombre}</a></td>
                    <td>{c.todos ? <span className="chip acc">Todos</span> : [c.categoria, c.marca].filter(Boolean).join(' · ') || 'General'}</td>
                    <td>{c.tipo === 'pdf' ? 'PDF' : 'Drive'}</td>
                    <td><span className={`chip ${c.activo ? 'ok' : 'neu'}`}>{c.activo ? 'Activo' : 'Inactivo'}</span></td>
                    {administra && <td className="r"><AccionesCatalogo id={c.id} activo={c.activo} nombre={c.nombre} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {administra && <FormCatalogo />}
    </>
  )
}
