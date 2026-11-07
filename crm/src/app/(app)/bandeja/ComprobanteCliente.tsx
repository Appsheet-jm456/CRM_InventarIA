'use client'

import { useCallback, useEffect, useState } from 'react'
import { clienteNavegador } from '@/lib/supabase/navegador'
import { rechazarComprobante, reintentarAviso, validarComprobante } from './acciones'
import { Media, type Mensaje } from './Bandeja'

type Compra = { paso?: string; total?: number; tipo?: string; codigo?: string; equipo?: string; equipos?: { codigo: string; equipo: string }[];
  comprobante_en?: string; validacion?: string; rechazos?: number }

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-CO')}`
const hora = (t: string) => new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })

// F4·46 (RAG-64 a RAG-66): «💳 Comprobante por validar» en el panel del cliente, para quien tiene validar_pagos.
export function ComprobanteCliente({ lead, version, alCambiar }: { lead: number; version: number; alCambiar: () => void }) {
  const [compra, setCompra] = useState<Compra | null>(null)
  const [soporte, setSoporte] = useState<Mensaje | null>(null)
  const [motivos, setMotivos] = useState<string[]>([])
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [otro, setOtro] = useState('')
  const [aviso, setAviso] = useState<{ error?: string; ok?: string }>({})
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    const sb = clienteNavegador()
    const [{ data: l }, { data: m }, { data: cfg }] = await Promise.all([
      sb.from('leads').select('estado_bot').eq('id', lead).maybeSingle(),
      sb.from('mensajes').select('id, lado, tipo, texto, creado_en, usuario_id, media_ruta, media_mime, media_nombre, estado_entrega, error_meta')
        .eq('lead_id', lead).eq('lado', 'cliente').neq('media_ruta', '').order('creado_en', { ascending: false }).limit(1),
      sb.from('agente_config').select('motivos_rechazo').eq('id', 1).maybeSingle(),
    ])
    const c = ((l?.estado_bot ?? {}) as { compra?: Compra }).compra ?? null
    setCompra(c?.paso === 'pago_por_confirmar' ? c : null)
    setSoporte(((m ?? [])[0] as Mensaje | undefined) ?? null)
    setMotivos((cfg?.motivos_rechazo as string[] | undefined) ?? [])
  }, [lead])

  useEffect(() => { setAviso({}); setRechazando(false); cargar() }, [cargar, version])

  async function hacer(accion: () => Promise<{ error?: string; ok?: string }>, pregunta?: string) {
    if (pregunta && !confirm(pregunta)) return
    setOcupado(true)
    const r = await accion()
    setOcupado(false)
    setAviso(r)
    setRechazando(false)
    cargar()
    alCambiar()
  }

  if (!compra) return aviso.ok || aviso.error ? <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div> : null
  const equipos = compra.equipos?.length ? compra.equipos : compra.codigo ? [{ codigo: compra.codigo, equipo: compra.equipo ?? '' }] : []
  const pendiente = compra.validacion === 'validado' || compra.validacion === 'rechazado'
  const total = pesos(Number(compra.total ?? 0))
  const elegido = motivo === '__otro' ? otro : motivo

  return (
    <div className="aviso warn" style={{ display: 'grid', gap: 8 }}>
      <b>💳 Comprobante por validar</b>
      {soporte?.media_ruta ? <Media m={soporte} /> : <small>El cliente no mandó una imagen o PDF.</small>}
      <small>
        {equipos.map((e) => `${e.equipo} (${e.codigo})`).join(' + ') || 'Compra'} · {compra.tipo === 'distribuidor' ? 'distribuidor' : 'cliente final'}
        <br />Total esperado: <b>{total}</b>{compra.comprobante_en ? ` · llegó ${hora(compra.comprobante_en)}` : ''}
        {compra.rechazos ? ` · rechazado ${compra.rechazos} vez${compra.rechazos > 1 ? 'es' : ''}` : ''}
      </small>
      {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}
      {pendiente ? (
        <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => reintentarAviso(lead))}>Avisar al cliente</button>
      ) : rechazando ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <select value={motivo} disabled={ocupado} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo">
            <option value="">Elige el motivo…</option>
            {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="__otro">Otro…</option>
          </select>
          {motivo === '__otro' && <input value={otro} maxLength={200} disabled={ocupado} placeholder="Escribe el motivo" onChange={(e) => setOtro(e.target.value)} />}
          <div className="row">
            <button className="btn chico" disabled={ocupado || !elegido.trim()} onClick={() => hacer(() => rechazarComprobante(lead, elegido))}>Enviar al cliente</button>
            <button className="btn chico" disabled={ocupado} onClick={() => setRechazando(false)}>Volver</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="btn primary chico" disabled={ocupado}
            onClick={() => hacer(() => validarComprobante(lead), `¿Verificaste en la cuenta bancaria que entraron ${total}? El cliente recibirá la confirmación del pago.`)}>
            ✅ Comprobante validado
          </button>
          <button className="btn chico" disabled={ocupado} onClick={() => setRechazando(true)}>❌ No es válido</button>
        </div>
      )}
    </div>
  )
}
