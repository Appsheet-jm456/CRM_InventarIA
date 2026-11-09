'use client'

import { useRef, useState } from 'react'
import { Icono } from '@/components/Iconos'
import { clienteNavegador, subirConAvance } from '@/lib/supabase/navegador'
import { anularPago, registrarPago } from './acciones'

export type Pago = {
  id: number; valor: number; medio: string; fecha_pago: string; referencia: string | null; nota: string | null; origen: 'whatsapp' | 'manual'
  soporte_bucket: 'media' | 'pagos' | null; soporte_ruta: string | null; soporte_mime: string | null; creado_en: string
  anulado_en: string | null; anulado_motivo: string | null; registrado: { nombre: string } | null
}

export const MEDIOS = ['Transferencia', 'Efectivo en tienda', 'Tarjeta', 'Otro']
export const pesos = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
const hoy = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)

// RPD-35: total, pagado y saldo; lo usa también el resumen de la sección.
export function saldo(total: number | null, pagos: Pago[]) {
  const pagado = pagos.filter((p) => !p.anulado_en).reduce((s, p) => s + Number(p.valor), 0)
  const falta = total ? total - pagado : 0
  const estado: [string, string] = !pagado ? ['Sin pagos', 'warn'] : !total ? ['Pagado', 'ok'] : falta > 0 ? [`Saldo ${pesos(falta)}`, 'warn']
    : falta < 0 ? ['Pagó de más', 'acc'] : ['Pagado completo', 'ok']
  return { pagado, falta, estado }
}

// F4·54 (docs/PEDIDOS.md, RPD-32 a RPD-37): los pagos del pedido, del WhatsApp o subidos a mano, con su soporte.
export function PagosPedido({ oportunidad, lead, total, pagos, puedeRegistrar, puedeAnular, alCambiar }: {
  oportunidad: number; lead: number; total: number | null; pagos: Pago[]; puedeRegistrar: boolean; puedeAnular: boolean; alCambiar: () => void
}) {
  const [form, setForm] = useState<{ valor: string; medio: string; fecha: string; referencia: string; nota: string } | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [avance, setAvance] = useState<number | null>(null)
  const [aviso, setAviso] = useState<{ ok?: string; error?: string }>({})
  const [ocupado, setOcupado] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const { pagado, falta } = saldo(total, pagos)

  async function verSoporte(p: Pago) {
    if (!p.soporte_ruta) return
    if (p.soporte_bucket === 'media') return window.open(`/media/${p.soporte_ruta.split('/').map(encodeURIComponent).join('/')}`, '_blank')
    const { data } = await clienteNavegador().storage.from('pagos').createSignedUrl(p.soporte_ruta, 600)
    if (data) window.open(data.signedUrl, '_blank')
    else setAviso({ error: 'No se pudo abrir el soporte.' })
  }

  async function guardar() {
    if (!form) return
    const valor = Number(form.valor.replace(/[^\d]/g, ''))
    if (!valor) return setAviso({ error: 'Escribe el valor del pago.' })
    if (!archivo) return setAviso({ error: 'Adjunta el soporte del pago (foto o PDF).' })
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(archivo.type)) return setAviso({ error: 'El soporte debe ser JPG, PNG, WEBP o PDF.' })
    if (archivo.size > 10 * 1024 * 1024) return setAviso({ error: 'El soporte pesa más de 10 MB.' })
    if (!confirm(`¿Registrar un pago de ${pesos(valor)} (${form.medio})?`)) return
    setOcupado(true)
    const ext = archivo.type === 'application/pdf' ? 'pdf' : archivo.type.split('/')[1].replace('jpeg', 'jpg')
    const ruta = `${oportunidad}/${crypto.randomUUID()}.${ext}`
    setAvance(0)
    const fallo = await subirConAvance('pagos', ruta, archivo, setAvance)
    setAvance(null)
    const r = fallo ? { error: fallo } : await registrarPago(oportunidad, lead, { valor, medio: form.medio, fecha: form.fecha,
      referencia: form.referencia, nota: form.nota, ruta, mime: archivo.type })
    setOcupado(false)
    setAviso(r)
    if (!r.error) { setForm(null); setArchivo(null) }
    alCambiar()
  }

  async function anular(p: Pago) {
    const motivo = prompt(`¿Por qué se anula el pago de ${pesos(Number(p.valor))}? (queda en el historial)`)?.trim()
    if (!motivo) return
    setOcupado(true)
    const r = await anularPago(p.id, lead, motivo)
    setOcupado(false)
    setAviso(r)
    alCambiar()
  }

  return (
    <div className="pg">
      <div className="pg-totales">
        <div><small>Total del pedido</small><b>{total ? pesos(total) : '—'}</b></div>
        <div><small>Pagado</small><b className="ped-ok">{pesos(pagado)}</b></div>
        <div><small>{falta < 0 ? 'Pagó de más' : 'Saldo'}</small><b className={falta > 0 ? 'ped-aviso' : undefined}>{total ? pesos(Math.abs(falta)) : '—'}</b></div>
      </div>
      {pagos.length === 0 && <small className="muted">Todavía no hay pagos registrados.</small>}
      {pagos.map((p) => (
        <div key={p.id} className={`pg-pago${p.anulado_en ? ' anulado' : ''}`}>
          <span className={`ped-envio-i${p.anulado_en ? '' : ' ok'}`}><Icono nombre={p.origen === 'whatsapp' ? 'chat' : 'documento'} /></span>
          <div className="ped-datos">
            <b>{pesos(Number(p.valor))} · {p.medio}</b>
            <small className="muted">
              {fecha(p.fecha_pago)} · {p.origen === 'whatsapp' ? 'Comprobante del WhatsApp' : 'Subido a mano'}{p.registrado?.nombre ? ` por ${p.registrado.nombre}` : ''}
              {p.referencia ? ` · Ref. ${p.referencia}` : ''}{p.nota ? ` · ${p.nota}` : ''}
            </small>
            {p.anulado_en && <small className="error">Anulado: {p.anulado_motivo}</small>}
          </div>
          <span className="row" style={{ gap: 6 }}>
            {p.soporte_ruta && <button className="btn chico" onClick={() => verSoporte(p)}>Ver soporte</button>}
            {puedeAnular && !p.anulado_en && <button className="btn chico peligro" disabled={ocupado} onClick={() => anular(p)}>Anular</button>}
          </span>
        </div>
      ))}
      {puedeRegistrar && !form && (
        <div><button className="btn chico" onClick={() => setForm({ valor: falta > 0 ? String(Math.round(falta)) : '', medio: 'Transferencia', fecha: hoy(), referencia: '', nota: '' })}>
          Registrar pago</button></div>
      )}
      {puedeRegistrar && form && (
        <form className="ped-guia" onSubmit={(e) => { e.preventDefault(); guardar() }}>
          <div className="ped-doc">
            <input inputMode="numeric" value={form.valor ? Number(form.valor.replace(/[^\d]/g, '') || 0).toLocaleString('es-CO') : ''} aria-label="Valor del pago"
              onChange={(e) => setForm({ ...form, valor: e.target.value.replace(/[^\d]/g, '') })} placeholder="Valor: 1.000.000" />
            <select value={form.medio} onChange={(e) => setForm({ ...form, medio: e.target.value })} aria-label="Medio de pago">
              {MEDIOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input type="date" value={form.fecha} max={hoy()} onChange={(e) => setForm({ ...form, fecha: e.target.value })} aria-label="Fecha del pago" />
          </div>
          <div className="ped-doc">
            <input value={form.referencia} maxLength={60} onChange={(e) => setForm({ ...form, referencia: e.target.value })} placeholder="Referencia (opcional)" aria-label="Referencia" />
            <input value={form.nota} maxLength={200} onChange={(e) => setForm({ ...form, nota: e.target.value })} placeholder="Nota (opcional)" aria-label="Nota" />
          </div>
          <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          <div className="row">
            <button type="button" className="btn chico" onClick={() => entrada.current?.click()}>{archivo ? `Soporte: ${archivo.name}` : 'Adjuntar soporte (foto o PDF)'}</button>
            <button className="btn primary chico" disabled={ocupado}>{avance !== null ? `Subiendo… ${avance} %` : 'Guardar pago'}</button>
            <button type="button" className="btn chico" onClick={() => { setForm(null); setArchivo(null) }}>Volver</button>
          </div>
        </form>
      )}
      {(aviso.ok || aviso.error) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}
    </div>
  )
}
