'use client'

import { useEffect, useState } from 'react'

// Modo de pantalla que eligió el usuario en Apariencia (data-modo en <html>, F4·19): 'light', 'dark' o, si no
// eligió, 'system' (sigue al equipo). Para componentes de terceros que traen su propio tema, como el lienzo (F4·21).
export function useModoApp(): 'light' | 'dark' | 'system' {
  const [modo, setModo] = useState<'light' | 'dark' | 'system'>('system')
  useEffect(() => {
    const leer = () => {
      const m = document.documentElement.dataset.modo
      setModo(m === 'oscuro' ? 'dark' : m === 'claro' ? 'light' : 'system')
    }
    leer()
    const obs = new MutationObserver(leer)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-modo'] })
    return () => obs.disconnect()
  }, [])
  return modo
}
