'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { enviarMeta, type Resultado } from './acciones'
import { Comprobaciones, TokenUnaVez } from './Piezas'

const MASCARA = '••••••••••••••••••••'

type Props = {
  valores: { appId: string; wabaId: string; phoneNumberId: string }
  guardados: { token: string | null; appSecret: string | null }  // fecha en que se guardó, nunca el valor
  seguro: boolean
  motivo: string
}

function Botones({ bloqueado }: { bloqueado: boolean }) {
  const { pending } = useFormStatus()
  return (
    <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
      <button className="btn" name="accion" value="probar" disabled={pending || bloqueado}>
        {pending ? 'Consultando a Meta…' : 'Probar'}
      </button>
      <button className="btn primary" name="accion" value="guardar" disabled={pending || bloqueado}>
        Probar y guardar
      </button>
    </div>
  )
}

export function FormMeta({ valores, guardados, seguro, motivo }: Props) {
  const [estado, accion] = useFormState<Resultado, FormData>(enviarMeta, {})
  const [cambioApp, setCambioApp] = useState(false)
  return (
    <form action={accion} className="panel-b" style={{ display: 'grid', gap: 14 }} autoComplete="off">
      {!seguro && <div className="aviso bad">{motivo}</div>}
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <label className="field">App ID
          <input name="app_id" defaultValue={valores.appId} inputMode="numeric" required className="mono"
            onChange={(e) => setCambioApp(!!valores.appId && e.target.value.trim() !== valores.appId)} />
        </label>
        <label className="field">WABA ID (cuenta de WhatsApp)
          <input name="waba_id" defaultValue={valores.wabaId} inputMode="numeric" required className="mono" />
        </label>
        <label className="field">Phone Number ID
          <input name="phone_number_id" defaultValue={valores.phoneNumberId} inputMode="numeric" required className="mono" />
        </label>
      </div>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <label className="field">Token de acceso
          <input name="token" type="password" autoComplete="new-password" spellCheck={false} className="mono"
            placeholder={guardados.token ? MASCARA : 'Pega el token del usuario del sistema'} required={!guardados.token} />
          <small>{guardados.token ? `Guardado ${guardados.token} · déjalo vacío para conservarlo` : 'Aún no hay token guardado.'}</small>
        </label>
        <label className="field">App Secret
          <input name="app_secret" type="password" autoComplete="new-password" spellCheck={false} className="mono"
            placeholder={guardados.appSecret ? MASCARA : 'Pega el App Secret de la app'} required={!guardados.appSecret} />
          <small>{guardados.appSecret ? `Guardado ${guardados.appSecret} · déjalo vacío para conservarlo` : 'Aún no hay App Secret guardado.'}</small>
        </label>
      </div>
      {cambioApp && (
        <div className="aviso warn">
          Estás cambiando de app. Al guardar, el webhook y la suscripción de la WABA deben quedar apuntando a la app nueva (se
          registran más abajo), y las plantillas pertenecen a la WABA, no a la app. Los mensajes seguirán llegando por la app
          anterior hasta que registres el webhook de la nueva.
        </div>
      )}
      <Botones bloqueado={!seguro} />
      {estado.error && <div className="aviso bad">{estado.error}</div>}
      {estado.ok && <div className="aviso ok">{estado.ok}</div>}
      {estado.verifyToken && <TokenUnaVez token={estado.verifyToken} />}
      {estado.pasos && <Comprobaciones pasos={estado.pasos} />}
    </form>
  )
}
