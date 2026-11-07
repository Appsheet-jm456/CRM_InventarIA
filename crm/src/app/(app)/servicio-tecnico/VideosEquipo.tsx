'use client'

import { useRef, useState } from 'react'
import { clienteNavegador, subirConAvance } from '@/lib/supabase/navegador'
import { registrarVideo, type Resultado } from './acciones'

export type Video = {
  id: number
  equipo_codigo: string
  estado: 'procesando' | 'listo' | 'error' | 'vencido'
  tecnico: string
  subido_en: string
  ruta: string | null
  peso: number | null
  error: string | null
}

const MAXIMO = 95 * 1024 * 1024 // Cloudflare corta los envíos de más de 100 MB
const hora = (t: string) => new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
const ESTADO: Record<Video['estado'], [string, string]> = {
  procesando: ['⏳ Preparando', 'warn'], listo: ['✅ Listo', 'ok'], error: ['❌ Error', 'bad'], vencido: ['Vencido', 'neu'],
}

// F4·50 bloque B (RAL-05): los videos de un equipo. El técnico sube (con avance) y cualquiera con permiso los ve con un enlace firmado.
export function VideosEquipo({ pedido, codigo, videos, quien, puedeSubir, alTerminar }: {
  pedido: number; codigo: string; videos: Video[]; quien?: string; puedeSubir: boolean; alTerminar: (r: Resultado) => void
}) {
  const archivo = useRef<HTMLInputElement>(null)
  const [avance, setAvance] = useState<number | null>(null)
  const [viendo, setViendo] = useState<{ id: number; url: string } | null>(null)

  async function ver(v: Video) {
    if (viendo?.id === v.id) return setViendo(null)
    const { data, error } = await clienteNavegador().storage.from('videos-tecnicos').createSignedUrl(v.ruta!, 3600)
    if (error || !data) return alTerminar({ error: 'No se pudo abrir el video.' })
    setViendo({ id: v.id, url: data.signedUrl })
  }

  async function subir(f: File) {
    if (!quien) return alTerminar({ error: 'Primero elige quién eres.' })
    if (!f.type.startsWith('video/')) return alTerminar({ error: 'Ese archivo no es un video.' })
    if (f.size > MAXIMO) return alTerminar({ error: `El video pesa ${(f.size / 1048576).toFixed(0)} MB y el máximo es 95 MB: grábalo más corto (hasta 2 minutos) o en 720p.` })
    const ext = (f.name.split('.').pop() ?? 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4'
    const ruta = `${pedido}/${codigo.replace(/[^A-Za-z0-9-]/g, '_')}/${crypto.randomUUID()}.${ext}`
    setAvance(0)
    const fallo = await subirConAvance('videos-tecnicos', ruta, f, setAvance)
    const r = fallo ? { error: fallo } : await registrarVideo(pedido, codigo, ruta, f.size, quien)
    setAvance(null)
    if (archivo.current) archivo.current.value = ''
    alTerminar(r)
  }

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {videos.map((v) => (
        <div key={v.id} style={{ display: 'grid', gap: 4 }}>
          <small className="row" style={{ gap: 6 }}>
            <span className={`chip ${ESTADO[v.estado][1]}`}>{ESTADO[v.estado][0]}</span>
            <span className="muted">{v.tecnico} · {hora(v.subido_en)}{v.peso ? ` · ${(v.peso / 1048576).toFixed(1)} MB` : ''}</span>
            {v.estado === 'listo' && v.ruta && <button type="button" className="btn-link" onClick={() => ver(v)}>{viendo?.id === v.id ? 'Ocultar' : '▶ Ver'}</button>}
          </small>
          {v.estado === 'error' && v.error && <small className="error">{v.error}. Súbelo de nuevo.</small>}
          {viendo?.id === v.id && <video src={viendo.url} controls playsInline style={{ width: '100%', maxWidth: 420, borderRadius: 8, background: '#000' }} />}
        </div>
      ))}
      {!videos.length && <small className="muted">Sin video todavía.</small>}
      {puedeSubir && (
        <div className="row" style={{ gap: 6 }}>
          <input ref={archivo} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f) }} />
          <button type="button" className="btn chico" disabled={avance !== null} onClick={() => archivo.current?.click()}>
            {avance !== null ? `Subiendo… ${avance} %` : videos.some((v) => v.estado !== 'error') ? '🎥 Subir otro video' : '🎥 Subir video'}
          </button>
          {avance !== null && <progress value={avance} max={100} style={{ flex: '1 1 120px' }} />}
        </div>
      )}
    </div>
  )
}
