'use client'

import { useState, useTransition } from 'react'
import { useFormState } from 'react-dom'
import { alternarPermiso, borrarRol, crearRol, type Resultado } from './acciones'

type Rol = { id: number; nombre: string; sistema: boolean; usuarios: number }
type Props = {
  permisos: { codigo: string; descripcion: string }[]
  roles: Rol[]
  asignados: string[]
}

export function MatrizPermisos({ permisos, roles, asignados }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [resultado, setResultado] = useState<Resultado>({})
  const [estadoNuevo, accionNuevo] = useFormState<Resultado, FormData>(crearRol, {})
  const tiene = new Set(asignados)

  const correr = (accion: () => Promise<Resultado>) =>
    iniciar(async () => setResultado(await accion()))

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Roles y permisos</h2>
            <small>
              Cada permiso es algo que la base verifica. El rol administrador no pierde el de administrar usuarios.
            </small>
          </div>
        </div>
        {resultado.error && (
          <div className="panel-b" style={{ paddingBottom: 0 }}>
            <div className="aviso bad">{resultado.error}</div>
          </div>
        )}
        <div className="tablewrap" style={{ opacity: pendiente ? 0.6 : 1 }}>
          <table>
            <thead>
              <tr>
                <th>Permiso</th>
                {roles.map((r) => (
                  <th key={r.id} className="c">
                    {r.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permisos.map((p) => (
                <tr key={p.codigo}>
                  <td>
                    {p.descripcion}
                    <div className="mono muted" style={{ fontSize: 11.5 }}>
                      {p.codigo}
                    </div>
                  </td>
                  {roles.map((r) => {
                    const on = tiene.has(`${r.id}:${p.codigo}`)
                    const fijo = r.sistema && p.codigo === 'administrar_usuarios'
                    return (
                      <td key={r.id} className="c">
                        <button
                          className={`toggle${on ? ' on' : ''}`}
                          aria-pressed={on}
                          aria-label={`${p.descripcion} · ${r.nombre}`}
                          title={fijo ? 'El administrador siempre administra usuarios' : undefined}
                          disabled={pendiente || fijo}
                          onClick={() => correr(() => alternarPermiso(r.id, p.codigo, !on))}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr>
                <td className="muted">Usuarios con el rol</td>
                {roles.map((r) => (
                  <td key={r.id} className="c">
                    <span className="num">{r.usuarios}</span>
                    {!r.sistema && r.usuarios === 0 && (
                      <div>
                        <button
                          className="btn chico peligro"
                          disabled={pendiente}
                          onClick={() => {
                            if (confirm(`¿Borrar el rol ${r.nombre}?`)) correr(() => borrarRol(r.id))
                          }}
                        >
                          Borrar
                        </button>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Nuevo rol</h2>
            <small>Arranca sin permisos.</small>
          </div>
        </div>
        <form action={accionNuevo} className="panel-b" style={{ display: 'grid', gap: 12 }}>
          <div className="row">
            <label className="field" style={{ flex: '1 1 220px', maxWidth: 320 }}>
              Nombre
              <input name="nombre" placeholder="bodega" required />
            </label>
            <button className="btn primary" style={{ alignSelf: 'flex-end' }}>
              Crear rol
            </button>
          </div>
          {estadoNuevo.error && <div className="aviso bad">{estadoNuevo.error}</div>}
          {estadoNuevo.ok && <div className="aviso ok">{estadoNuevo.ok}</div>}
        </form>
      </section>
    </>
  )
}
