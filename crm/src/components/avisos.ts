'use client'

import { useEffect, useRef, useState } from 'react'
import { clienteNavegador, prepararTiempoReal } from '@/lib/supabase/navegador'

// RS-05: con la app abierta, sonido y notificación cuando alguien entra a la cola, a los 10 min hábiles sin
// respuesta y a los 15. El número junto a Bandeja se ve siempre.

export function avisosActivos() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

let audio: AudioContext | null = null

function sonar(veces = 1) {
  try {
    audio ??= new AudioContext()
    for (let i = 0; i < veces; i++) {
      const o = audio.createOscillator()
      const g = audio.createGain()
      const inicio = audio.currentTime + i * 0.25
      o.frequency.value = 880
      g.gain.setValueAtTime(0.0001, inicio)
      g.gain.exponentialRampToValueAtTime(0.2, inicio + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.18)
      o.connect(g).connect(audio.destination)
      o.start(inicio)
      o.stop(inicio + 0.2)
    }
  } catch {}
}

// Se llama con un clic: el navegador solo deja sonar y pedir permiso después de un gesto del usuario.
export async function activarAvisos() {
  if (typeof Notification === 'undefined') return false
  const permiso = await Notification.requestPermission()
  sonar()
  return permiso === 'granted'
}

function avisar(titulo: string, cuerpo: string, veces: number, lead: number) {
  sonar(veces)
  if (!avisosActivos() || document.hasFocus()) return
  try {
    const n = new Notification(titulo, { body: cuerpo, tag: `crm-${lead}-${veces}` })
    n.onclick = () => {
      window.focus()
      window.location.href = `/bandeja?c=${lead}`
    }
  } catch {}
}

type Espera = { id: number; nombre: string; telefono: string; minutos_espera: number | null }

export function useAvisosBandeja(activo: boolean) {
  const [estado, setEstado] = useState({ pendientes: 0, vencidas: 0 })
  const avisados = useRef<Map<number, number> | null>(null)

  useEffect(() => {
    if (!activo) return
    let vigente = true
    let espera: ReturnType<typeof setTimeout> | undefined

    async function revisar() {
      const { data } = await clienteNavegador()
        .from('leads')
        .select('id, nombre, telefono, minutos_espera')
        .in('estado_chat', ['cola', 'asignada'])
        .is('primera_respuesta_en', null)
        .not('en_cola_desde', 'is', null)
      if (!vigente) return
      const lista = (data ?? []) as Espera[]
      setEstado({ pendientes: lista.length, vencidas: lista.filter((l) => (l.minutos_espera ?? 0) >= 10).length })

      const primera = avisados.current === null
      const antes = avisados.current ?? new Map<number, number>()
      const ahora = new Map<number, number>()
      for (const l of lista) {
        const nivel = (l.minutos_espera ?? 0) >= 15 ? 15 : (l.minutos_espera ?? 0) >= 10 ? 10 : 1
        ahora.set(l.id, nivel)
        const previo = antes.get(l.id) ?? 0
        if (primera || nivel <= previo) continue
        const quien = l.nombre || `+${l.telefono}`
        if (nivel === 1) avisar('Nuevo cliente en la cola', quien, 1, l.id)
        else if (nivel === 10) avisar(`${quien} lleva 10 min sin respuesta`, 'Se venció el tiempo de primera respuesta.', 2, l.id)
        else avisar(`${quien} lleva 15 min sin respuesta`, 'Alerta de SLA: atiéndelo ya.', 3, l.id)
      }
      avisados.current = ahora
    }

    const programar = () => {
      clearTimeout(espera)
      espera = setTimeout(revisar, 400)
    }
    revisar()
    let canal: ReturnType<ReturnType<typeof clienteNavegador>['channel']> | null = null
    prepararTiempoReal().then((supabase) => {
      if (!vigente) return
      canal = supabase
        .channel('avisos-bandeja')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, programar)
        .subscribe()
    })
    const reloj = setInterval(revisar, 60000)
    return () => {
      vigente = false
      clearTimeout(espera)
      clearInterval(reloj)
      if (canal) clienteNavegador().removeChannel(canal)
    }
  }, [activo])

  return estado
}
