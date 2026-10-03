'use client'

import { useState } from 'react'
import type { Paso } from '@/lib/metaPrueba'

const MARCA: Record<Paso['estado'], { simbolo: string; clase: string }> = {
  ok: { simbolo: '✓', clase: 'ok' },
  mal: { simbolo: '✗', clase: 'bad' },
  aviso: { simbolo: '!', clase: 'warn' },
  omitido: { simbolo: '–', clase: 'neu' },
}

export function Comprobaciones({ pasos }: { pasos: Paso[] }) {
  return (
    <div className="tablewrap">
      <table>
        <tbody>
          {pasos.map((p) => (
            <tr key={p.clave}>
              <td style={{ width: 36 }}><span className={`chip ${MARCA[p.estado].clase}`}>{MARCA[p.estado].simbolo}</span></td>
              <td>{p.titulo}{!p.critico && <small className="muted"> · informativo</small>}</td>
              <td className="muted">{p.detalle}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// El token de verificación se muestra una sola vez (RC-01): se copia para pegarlo en Meta.
export function TokenUnaVez({ token }: { token: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="aviso warn" style={{ display: 'grid', gap: 8 }}>
      <strong>Token de verificación (se muestra solo ahora)</strong>
      <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
        <code className="mono" style={{ userSelect: 'all', wordBreak: 'break-all' }}>{token}</code>
        <button type="button" className="btn chico"
          onClick={async () => { await navigator.clipboard.writeText(token); setCopiado(true) }}>
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <small>Si usas «Registrar webhook» de esta pantalla no necesitas pegarlo en Meta: ya lo envía el servidor.</small>
    </div>
  )
}
