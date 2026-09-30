'use client'

import { useState, useTransition } from 'react'
import { cambiarActivo, cambiarClave, cambiarRol, type Resultado } from './acciones'

type Props = {
  usuario: { id: string; nombre: string; usuario: string; rol_id: number; activo: boolean }
  roles: { id: number; nombre: string }[]
  esYo: boolean
}

export function FilaUsuario({ usuario, roles, esYo }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [resultado, setResultado] = useState<Resultado>({})
  const [clave, setClave] = useState('')
  const [editandoClave, setEditandoClave] = useState(false)

  const correr = (accion: () => Promise<Resultado>) =>
    iniciar(async () => {
      const r = await accion()
      setResultado(r)
      if (r.ok) {
        setClave('')
        setEditandoClave(false)
      }
    })

  return (
    <>
      <tr style={{ opacity: pendiente ? 0.6 : 1 }}>
        <td>
          {usuario.nombre}
          {esYo && <span className="chip acc" style={{ marginLeft: 8 }}>Tú</span>}
        </td>
        <td className="mono">{usuario.usuario}</td>
        <td>
          <select
            className="btn chico"
            aria-label={`Rol de ${usuario.nombre}`}
            value={usuario.rol_id}
            disabled={pendiente}
            onChange={(e) => correr(() => cambiarRol(usuario.id, Number(e.target.value)))}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </td>
        <td>
          <div className="row" style={{ gap: 8 }}>
            <button
              className={`toggle${usuario.activo ? ' on' : ''}`}
              aria-pressed={usuario.activo}
              aria-label={`${usuario.activo ? 'Desactivar' : 'Activar'} a ${usuario.nombre}`}
              disabled={pendiente || esYo}
              title={esYo ? 'No puedes desactivar tu propio usuario' : undefined}
              onClick={() => correr(() => cambiarActivo(usuario.id, !usuario.activo))}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              {usuario.activo ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </td>
        <td>
          {editandoClave ? (
            <form
              className="inline"
              onSubmit={(e) => {
                e.preventDefault()
                correr(() => cambiarClave(usuario.id, clave))
              }}
            >
              <input
                type="password"
                aria-label={`Contraseña nueva de ${usuario.nombre}`}
                placeholder="Nueva (mín. 8)"
                autoComplete="new-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                autoFocus
              />
              <button className="btn chico primary" disabled={pendiente}>
                Guardar
              </button>
              <button type="button" className="btn chico" onClick={() => setEditandoClave(false)}>
                Cancelar
              </button>
            </form>
          ) : (
            <button className="btn chico" onClick={() => setEditandoClave(true)}>
              Cambiar contraseña
            </button>
          )}
        </td>
      </tr>
      {(resultado.error || resultado.ok) && (
        <tr>
          <td colSpan={5} style={{ paddingTop: 0 }}>
            <div className={`aviso ${resultado.error ? 'bad' : 'ok'}`}>{resultado.error ?? resultado.ok}</div>
          </td>
        </tr>
      )}
    </>
  )
}
