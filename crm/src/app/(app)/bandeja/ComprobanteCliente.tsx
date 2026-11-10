'use client'

import { useCallback, useEffect, useState } from 'react'
import { clienteNavegador } from '@/lib/supabase/navegador'
import { despacharConSaldo, rechazarComprobante, reintentarAviso, validarComprobante } from './acciones'
import { Media, type Mensaje } from './Bandeja'

type Compra = { paso?: string; total?: number; tipo?: string; codigo?: string; equipo?: string; equipos?: { codigo: string; equipo: string }[];
  comprobante_en?: string; validacion?: string; rechazos?: number; pagado?: number; saldo?: number; abono?: number }

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-CO')}`
const hora = (t: string) => new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
const numero = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0

// F4·46 (RAG-64 a RAG-66) y F4·59 (RPD-41 a RPD-49): «💳 Comprobante por validar» en el panel del cliente (Bandeja, Ficha → Chat y
// Ficha → Oportunidades), para quien tiene validar_pagos. Pago completo, pago parcial (abono) o no válido; con un abono, el pedido
// espera el saldo y la tarjeta queda como «Saldo pendiente», con la excepción «Despachar con saldo pendiente» (RPD-45b).
export function ComprobanteCliente({ lead, version, alCambiar }: { lead: number; version: number; alCambiar: () => void }) {
  const [compra, setCompra] = useState<Compra | null>(null)
  const [soporte, setSoporte] = useState<Mensaje | null>(null)
  const [motivos, setMotivos] = useState<string[]>([])
  const [modo, setModo] = useState<'' | 'rechazar' | 'parcial' | 'saldo'>('')
  const [motivo, setMotivo] = useState('')
  const [otro, setOtro] = useState('')
  const [abono, setAbono] = useState('')
  const [razon, setRazon] = useState('')
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
    const conSaldo = c?.paso === 'esperando_pago' && Number(c.pagado ?? 0) > 0 && Number(c.saldo ?? 0) > 0
    setCompra(c?.paso === 'pago_por_confirmar' || conSaldo ? c : null)
    setSoporte(((m ?? [])[0] as Mensaje | undefined) ?? null)
    setMotivos((cfg?.motivos_rechazo as string[] | undefined) ?? [])
  }, [lead])

  useEffect(() => { setAviso({}); setModo(''); setAbono(''); setRazon(''); cargar() }, [cargar, version])

  async function hacer(accion: () => Promise<{ error?: string; ok?: string }>, pregunta?: string) {
    if (pregunta && !confirm(pregunta)) return
    setOcupado(true)
    const r = await accion()
    setOcupado(false)
    setAviso(r)
    if (!r.error) { setModo(''); setAbono(''); setRazon('') }
    cargar()
    alCambiar()
  }

  if (!compra) return aviso.ok || aviso.error ? <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div> : null
  const equipos = compra.equipos?.length ? compra.equipos : compra.codigo ? [{ codigo: compra.codigo, equipo: compra.equipo ?? '' }] : []
  const pendiente = compra.validacion === 'validado' || compra.validacion === 'rechazado' || compra.validacion === 'abono'
  const total = Number(compra.total ?? 0)
  const pagado = Number(compra.pagado ?? 0)
  const saldo = Math.max(total - pagado, 0)
  const esperandoSaldo = compra.paso === 'esperando_pago'
  const valorAbono = numero(abono)
  const elegido = motivo === '__otro' ? otro : motivo

  const cuentas = (
    <div className="row" style={{ gap: 6 }}>
      <span className="chip neu">Total <b>{pesos(total)}</b></span>
      <span className={`chip ${pagado > 0 ? 'ok' : 'neu'}`}>Pagado <b>{pesos(pagado)}</b></span>
      <span className={`chip ${saldo > 0 ? 'warn' : 'ok'}`}>Saldo <b>{pesos(saldo)}</b></span>
    </div>
  )
  const resultado = (aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>

  // Ya abonó: el pedido espera el soporte que falta (RPD-45); la excepción va con motivo (RPD-45b).
  if (esperandoSaldo) return (
    <div className="aviso warn" style={{ display: 'grid', gap: 8 }}>
      <b>◐ Saldo pendiente · esperando el soporte que falta</b>
      {cuentas}
      <small>Cuando el cliente mande el siguiente comprobante, esta tarjeta vuelve a «Comprobante por validar».</small>
      {resultado}
      {modo === 'saldo' ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <input value={razon} maxLength={200} disabled={ocupado} autoFocus placeholder="Motivo (p. ej. cliente frecuente, paga contraentrega)"
            onChange={(e) => setRazon(e.target.value)} />
          <div className="row">
            <button className="btn primary chico" disabled={ocupado || !razon.trim()}
              onClick={() => hacer(() => despacharConSaldo(lead, razon), `¿Despachar con un saldo pendiente de ${pesos(saldo)}? El cliente sigue con los datos de despacho.`)}>
              🚚 Despachar
            </button>
            <button className="btn chico" disabled={ocupado} onClick={() => setModo('')}>Volver</button>
          </div>
        </div>
      ) : (
        <div className="row"><button className="btn chico" disabled={ocupado} onClick={() => setModo('saldo')}>🚚 Despachar con saldo pendiente</button></div>
      )}
    </div>
  )

  return (
    <div className="aviso warn" style={{ display: 'grid', gap: 8 }}>
      <b>💳 Comprobante por validar</b>
      {soporte?.media_ruta ? <Media m={soporte} /> : <small>El cliente no mandó una imagen o PDF.</small>}
      <small>
        {equipos.map((e) => `${e.equipo} (${e.codigo})`).join(' + ') || 'Compra'} · {compra.tipo === 'distribuidor' ? 'distribuidor' : 'cliente final'}
        {compra.comprobante_en ? ` · llegó ${hora(compra.comprobante_en)}` : ''}
        {compra.rechazos ? ` · rechazado ${compra.rechazos} vez${compra.rechazos > 1 ? 'es' : ''}` : ''}
      </small>
      {cuentas}
      {resultado}
      {pendiente ? (
        <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => reintentarAviso(lead))}>Avisar al cliente</button>
      ) : modo === 'rechazar' ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <select value={motivo} disabled={ocupado} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo">
            <option value="">Elige el motivo…</option>
            {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="__otro">Otro…</option>
          </select>
          {motivo === '__otro' && <input value={otro} maxLength={200} disabled={ocupado} placeholder="Escribe el motivo" onChange={(e) => setOtro(e.target.value)} />}
          <div className="row">
            <button className="btn chico" disabled={ocupado || !elegido.trim()} onClick={() => hacer(() => rechazarComprobante(lead, elegido))}>Enviar al cliente</button>
            <button className="btn chico" disabled={ocupado} onClick={() => setModo('')}>Volver</button>
          </div>
        </div>
      ) : modo === 'parcial' ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="field">¿Cuánto pagó?
            <input inputMode="numeric" value={abono} disabled={ocupado} autoFocus placeholder="$ 1.000.000"
              onChange={(e) => { const n = numero(e.target.value); setAbono(n ? `$ ${n.toLocaleString('es-CO')}` : '') }} />
          </label>
          {valorAbono > 0 && (
            valorAbono >= saldo
              ? <small className="bad">Cubre todo el saldo ({pesos(saldo)}): usa «Pago completo».</small>
              : <small>{pesos(saldo)} − {pesos(valorAbono)} = <b>queda un saldo de {pesos(saldo - valorAbono)}</b>. El cliente recibe ese saldo y el pedido espera el soporte que falta.</small>
          )}
          <div className="row">
            <button className="btn primary chico" disabled={ocupado || valorAbono <= 0 || valorAbono >= saldo}
              onClick={() => hacer(() => validarComprobante(lead, valorAbono), `¿Verificaste en la cuenta bancaria que entraron ${pesos(valorAbono)}?`)}>
              Enviar al cliente
            </button>
            <button className="btn chico" disabled={ocupado} onClick={() => setModo('')}>Volver</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="btn primary chico" disabled={ocupado}
            onClick={() => hacer(() => validarComprobante(lead), `¿Verificaste en la cuenta bancaria que entraron ${pesos(saldo)}? El cliente recibirá la confirmación del pago.`)}>
            ✅ Pago completo {pesos(saldo)}
          </button>
          <button className="btn chico" disabled={ocupado || saldo <= 0} onClick={() => setModo('parcial')}>◐ Pago parcial</button>
          <button className="btn chico" disabled={ocupado} onClick={() => setModo('rechazar')}>❌ No es válido</button>
        </div>
      )}
    </div>
  )
}
