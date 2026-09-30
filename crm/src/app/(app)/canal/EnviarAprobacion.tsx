'use client'

import { useState } from 'react'
import { enviarAAprobacion } from './acciones'

export function EnviarAprobacion({ nombre }: { nombre: string }) {
  const [ocupado, setOcupado] = useState(false)
  const [r, setR] = useState<{ error?: string; ok?: string }>({})
  return (
    <div className="inline" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <button className="btn chico primary" disabled={ocupado || !!r.ok}
        onClick={async () => {
          if (!confirm(`¿Enviar ${nombre} a aprobación de Meta?`)) return
          setOcupado(true)
          setR(await enviarAAprobacion(nombre))
          setOcupado(false)
        }}>
        {ocupado ? 'Enviando…' : 'Enviar a aprobación'}
      </button>
      {r.error && <small className="aviso bad">{r.error}</small>}
      {r.ok && <small className="aviso ok">{r.ok}</small>}
    </div>
  )
}
