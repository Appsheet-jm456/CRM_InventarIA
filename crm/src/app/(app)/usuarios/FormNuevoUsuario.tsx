'use client'

import { useEffect, useRef } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { crearUsuario, type Resultado } from './acciones'

function Crear() {
  const { pending } = useFormStatus()
  return (
    <button className="btn primary" disabled={pending}>
      {pending ? 'Creando…' : 'Crear usuario'}
    </button>
  )
}

export function FormNuevoUsuario({ roles }: { roles: { id: number; nombre: string }[] }) {
  const [estado, accion] = useFormState<Resultado, FormData>(crearUsuario, {})
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado.ok) form.current?.reset()
  }, [estado])

  return (
    <form ref={form} action={accion} className="panel-b" style={{ display: 'grid', gap: 12 }}>
      <div className="form-grid">
        <label className="field">
          Nombre
          <input name="nombre" placeholder="Andrea Gómez" required />
        </label>
        <label className="field">
          Usuario para entrar
          <input name="usuario" placeholder="andrea" autoCapitalize="none" autoComplete="off" required />
        </label>
        <label className="field">
          Contraseña (mínimo 8)
          <input name="clave" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label className="field">
          Rol
          <select name="rol_id" defaultValue={roles.find((r) => r.nombre === 'asesor')?.id ?? ''} required>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        <Crear />
      </div>
      {estado.error && <div className="aviso bad">{estado.error}</div>}
      {estado.ok && <div className="aviso ok">{estado.ok}</div>}
    </form>
  )
}
