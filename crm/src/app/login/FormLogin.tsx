'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { iniciarSesion, type EstadoLogin } from './acciones'

function Entrar() {
  const { pending } = useFormStatus()
  return (
    <button className="btn primary" disabled={pending}>
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  )
}

export function FormLogin({ aviso }: { aviso?: string }) {
  const [estado, accion] = useFormState<EstadoLogin, FormData>(iniciarSesion, {})
  const error = estado.error ?? aviso
  return (
    <form action={accion}>
      <label className="field">
        Usuario
        <input name="usuario" autoComplete="username" autoCapitalize="none" autoFocus required />
      </label>
      <label className="field">
        Contraseña
        <input name="clave" type="password" autoComplete="current-password" required />
      </label>
      {error && (
        <div className="aviso bad" role="alert">
          {error}
        </div>
      )}
      <Entrar />
    </form>
  )
}
