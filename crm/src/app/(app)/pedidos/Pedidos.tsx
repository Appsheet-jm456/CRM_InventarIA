'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Icono } from '@/components/Iconos'
import type { Embudo, Etapa } from '../bandeja/OportunidadesCliente'
import { PedidoCliente } from '../leads/[id]/pedido/PedidoCliente'
import { nombreDocumento, numeroPedido, pasos, type Datos, type Entrega } from '../leads/[id]/pedido/pedido'
import { hora } from '../servicio-tecnico/ServicioTecnico'

export type Fase = 'por_revisar' | 'en_revision' | 'listo' | 'enviado' | 'entregado' | 'cancelado'
export type FilaPedido = Datos & {
  id: number
  lead_id: number
  cliente: string
  telefono: string
  equipos: { codigo: string; nombre: string }[]
  producto: string | null
  total: number | null
  pagado: number
  pagos: number
  entrega: Entrega
  etapa: string
  op_estado: string
  tecnico: string | null
  videos: number
  transportadora: string | null
  numero_guia: string | null
  cancelado_motivo: string | null
  fase: Fase
  alertas: string[]
}

// RPD-10: las columnas del Kanban (y los atajos de la tabla), con el mismo lenguaje de colores de la ficha (RPD-22).
const FASES: { clave: Fase; titulo: string; clase: string; color: string }[] = [
  { clave: 'por_revisar', titulo: 'Por revisar', clase: 'warn', color: 'var(--warn)' },
  { clave: 'en_revision', titulo: 'En revisión', clase: 'acc', color: 'var(--accent)' },
  { clave: 'listo', titulo: 'Listo para despachar', clase: 'ok', color: 'var(--ok)' },
  { clave: 'enviado', titulo: 'Enviado', clase: 'ok', color: 'var(--ok)' },
  { clave: 'entregado', titulo: 'Entregado', clase: 'ok', color: 'var(--ok)' },
  { clave: 'cancelado', titulo: 'Cancelado', clase: 'bad', color: 'var(--bad)' },
]
const FASE = Object.fromEntries(FASES.map((f) => [f.clave, f])) as Record<Fase, (typeof FASES)[number]>
const pesos = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const VISTA = 'pedidos:vista'
const dias = (t: string) => Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 86400000))

function equiposDe(p: FilaPedido) {
  return p.equipos.length ? p.equipos : [{ codigo: p.producto ?? '', nombre: p.producto ? `Equipo ${p.producto}` : 'Equipo del pedido' }]
}

// Mini barra de pasos del pedido (la misma regla que la ficha: 4 pasos en envío, 5 en tienda).
function Flujo({ p }: { p: FilaPedido }) {
  return (
    <span className={`pd-flujo${p.cancelado_en ? ' cancelado' : ''}`}>
      {pasos(p, p.entrega).map((s) => (
        <span key={s.clave} className={`pd-punto${s.hecho ? ' hecho' : ''}${s.actual ? ' actual' : ''}`}
          title={`${s.titulo}${s.hecho && s.cuando ? ` · ${hora(s.cuando)}` : s.actual ? ' · en curso' : ''}`} />
      ))}
    </span>
  )
}

function exportar(lista: FilaPedido[]) {
  const cab = ['Pedido', 'Fecha', 'Cliente', 'Teléfono', 'Equipos', 'Total', 'Pagado', 'Entrega', 'Estado', 'Técnico', 'Videos', 'Documento',
    'Video enviado', 'Documento enviado', 'Transportadora', 'Guía', 'Guía enviada', 'Entregado', 'Cancelado', 'Alertas']
  const filas = lista.map((p) => [numeroPedido(p.numero), p.creado_en.slice(0, 10), p.cliente, p.telefono,
    equiposDe(p).map((e) => `${e.nombre} ${e.codigo}`).join(' | '), p.total ?? '', p.pagado ?? '', p.entrega ?? '', FASE[p.fase].titulo, p.tecnico ?? '',
    `${p.videos}/${Math.max(p.equipos.length, 1)}`, p.doc_numero ? `${p.doc_tipo} ${p.doc_numero}` : '',
    p.video_enviado_en?.slice(0, 16) ?? '', p.documento_enviado_en?.slice(0, 16) ?? '', p.transportadora ?? '', p.numero_guia ?? '',
    p.guia_enviada_en?.slice(0, 16) ?? '', p.entregado_en?.slice(0, 16) ?? '', p.cancelado_motivo ?? '', p.alertas.join(' | ')])
  const csv = [cab, ...filas].map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// F4·55 (docs/PEDIDOS.md, RPD-08 a RPD-14): revisar todos los pedidos que pasaron el pago y el control de su despacho.
export function Pedidos({ pedidos, error, etapas, embudos, puedeDocumento, puedeCorregir, puedePagos, puedeEliminar = false }: {
  pedidos: FilaPedido[]; error: string | null; etapas: Etapa[]; embudos: Embudo[]; puedeDocumento: boolean; puedeCorregir: boolean; puedePagos: boolean
  puedeEliminar?: boolean // F4·67: solo el rol administrador
}) {
  const router = useRouter()
  const [vista, setVista] = useState<'tabla' | 'kanban'>('tabla')
  const [fase, setFase] = useState<Fase | 'todas' | 'alertas'>('todas')
  const [entrega, setEntrega] = useState('')
  const [tecnico, setTecnico] = useState('')
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState<FilaPedido | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    try { const v = localStorage.getItem(VISTA); if (v === 'tabla' || v === 'kanban') setVista(v) } catch { /* sin almacenamiento */ }
    const t = setInterval(() => router.refresh(), 60000)
    return () => clearInterval(t)
  }, [router])
  useEffect(() => { if (abierto) setAbierto(pedidos.find((p) => p.id === abierto.id) ?? null) }, [pedidos]) // eslint-disable-line react-hooks/exhaustive-deps

  function elegirVista(v: 'tabla' | 'kanban') {
    setVista(v)
    try { localStorage.setItem(VISTA, v) } catch { /* nada */ }
  }

  const tecnicos = useMemo(() => Array.from(new Set(pedidos.map((p) => p.tecnico).filter(Boolean))) as string[], [pedidos])
  const base = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return pedidos.filter((p) => (!entrega || (p.entrega ?? 'sin') === entrega) && (!tecnico || p.tecnico === tecnico)
      && (!q || [numeroPedido(p.numero), p.cliente, p.telefono, p.doc_numero, p.numero_guia, p.producto, ...p.equipos.flatMap((e) => [e.codigo, e.nombre])]
        .some((c) => (c ?? '').toLowerCase().includes(q))))
  }, [pedidos, entrega, tecnico, texto])
  const lista = fase === 'todas' ? base : fase === 'alertas' ? base.filter((p) => p.alertas.length) : base.filter((p) => p.fase === fase)
  const cuenta = (f: Fase) => base.filter((p) => p.fase === f).length
  const conAlertas = base.filter((p) => p.alertas.length).length

  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>Pedidos</h2>
          <small>Todos los pedidos con pago validado: servicio técnico, documento (FVE u OP), video y despacho. Toca un pedido para ver su flujo completo.</small>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <div className="pd-vistas" role="tablist" aria-label="Vista">
            <button role="tab" aria-selected={vista === 'tabla'} className={vista === 'tabla' ? 'activa' : ''} onClick={() => elegirVista('tabla')}>Tabla</button>
            <button role="tab" aria-selected={vista === 'kanban'} className={vista === 'kanban' ? 'activa' : ''} onClick={() => elegirVista('kanban')}>Kanban</button>
          </div>
          <button className="btn chico" onClick={() => exportar(lista)} disabled={!lista.length}>Exportar CSV</button>
        </div>
      </div>
      <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
        {error && <div className="aviso bad" role="alert">{error}</div>}

        <div className="pd-filtros">
          <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar cliente, teléfono, PED, código, FVE o guía" aria-label="Buscar" />
          <select value={entrega} onChange={(e) => setEntrega(e.target.value)} aria-label="Entrega">
            <option value="">Envío y tienda</option>
            <option value="envio">Envío</option>
            <option value="tienda">Tienda</option>
            <option value="sin">Entrega sin definir</option>
          </select>
          <select value={tecnico} onChange={(e) => setTecnico(e.target.value)} aria-label="Técnico">
            <option value="">Todos los técnicos</option>
            {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {vista === 'tabla' && (
          <div className="row" style={{ gap: 6 }}>
            <button className={`pastilla${fase === 'todas' ? ' activa' : ''}`} onClick={() => setFase('todas')}>Todos ({base.length})</button>
            {FASES.map((f) => (
              <button key={f.clave} className={`pastilla${fase === f.clave ? ' activa' : ''}`} onClick={() => setFase(f.clave)}>{f.titulo} ({cuenta(f.clave)})</button>
            ))}
            <button className={`pastilla${fase === 'alertas' ? ' activa' : ''}`} onClick={() => setFase('alertas')}>Con alertas ({conAlertas})</button>
          </div>
        )}

        {vista === 'tabla' && (
          <div className="pd-tabla">
            <table>
              <thead>
                <tr><th>Pedido</th><th>Cliente</th><th>Producto vendido</th><th>Flujo</th><th>Servicio técnico</th><th>Video</th><th>Documento</th><th>Despacho</th><th className="r">Total</th></tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const nEquipos = Math.max(p.equipos.length, 1)
                  return (
                    <tr key={p.id} className={`pd-fila${abierto?.id === p.id ? ' activa' : ''}`} onClick={() => setAbierto(p)} tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') setAbierto(p) }}>
                      <td><b>{numeroPedido(p.numero)}</b><small className="pd-sub">{hora(p.creado_en)}</small>
                        {p.alertas.length > 0 && <span className="chip warn" title={p.alertas.join('\n')}>{p.alertas.length} alerta{p.alertas.length > 1 ? 's' : ''}</span>}</td>
                      <td><b>{p.cliente}</b><small className="pd-sub">{p.telefono}</small></td>
                      <td>{equiposDe(p).map((e) => <div key={e.codigo || e.nombre}>{e.nombre}<small className="pd-sub">{e.codigo}</small></div>)}</td>
                      <td><Flujo p={p} /><small className="pd-sub"><span className={`chip ${FASE[p.fase].clase}`}>{FASE[p.fase].titulo}</span></small></td>
                      <td>{p.tecnico ?? <span className="muted">Sin técnico</span>}
                        <small className="pd-sub">{p.videos} de {nEquipos} video{nEquipos > 1 ? 's' : ''}</small></td>
                      <td>{p.video_enviado_en ? <span className="pd-ok"><Icono nombre="chulo" />Enviado</span>
                        : p.videos ? <span className="muted">Sin enviar</span> : <span className="muted">Sin video</span>}</td>
                      <td>{p.doc_numero ? <><span className="chip ok">{p.doc_tipo} {p.doc_numero}</span>
                        <small className="pd-sub">{p.documento_enviado_en ? 'Enviado al cliente' : 'Sin enviar'}</small></>
                        : p.cancelado_en ? <span className="muted">—</span> : <span className="chip warn">Falta</span>}</td>
                      <td>{p.cancelado_en ? <span className="muted">Cancelado: {p.cancelado_motivo}</span>
                        : p.entrega === 'tienda' ? <>{p.entregado_en ? `Entregado ${hora(p.entregado_en)}` : p.aviso_tienda_en ? 'Avisado para recoger' : 'Recoge en tienda'}</>
                        : p.numero_guia ? <>{p.transportadora}<small className="pd-sub">Guía {p.numero_guia}{p.guia_enviada_en ? '' : ' · sin enviar'}</small></>
                        : <span className="muted">{p.entrega === 'envio' ? 'Envío · sin guía' : 'Entrega sin definir'}</span>}</td>
                      <td className="r">{p.total ? pesos(Number(p.total)) : '—'}
                        <small className="pd-sub">{Number(p.pagado) ? `Pagado ${pesos(Number(p.pagado))}${p.pagos > 1 ? ` (${p.pagos} pagos)` : ''}` : 'Sin pagos'}</small></td>
                    </tr>
                  )
                })}
                {!lista.length && <tr><td colSpan={9} className="muted">No hay pedidos con estos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {vista === 'kanban' && (
          <div className="kanban">
            {FASES.map((f) => {
              const col = base.filter((p) => p.fase === f.clave)
              return (
                <section key={f.clave} className="k-col">
                  <div className="k-h" style={{ borderTopColor: f.color }}><b>{f.titulo}</b><small>{col.length}</small></div>
                  <div className="k-tarjetas">
                    {col.map((p) => (
                      <button key={p.id} className="k-tarjeta pd-tarjeta" onClick={() => setAbierto(p)}>
                        <span className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
                          <b>{numeroPedido(p.numero)}</b><Flujo p={p} />
                        </span>
                        <span className="k-nombre">{p.cliente}</span>
                        <small>{equiposDe(p).map((e) => e.nombre).join(', ')}</small>
                        <small>{p.tecnico ?? 'Sin técnico'} · {p.doc_numero ? `${p.doc_tipo} ${p.doc_numero}` : 'sin documento'} · {dias(p.creado_en)} d</small>
                        {p.alertas.length > 0 && <span className="chip warn" title={p.alertas.join('\n')}>{p.alertas[0]}{p.alertas.length > 1 ? ` (+${p.alertas.length - 1})` : ''}</span>}
                      </button>
                    ))}
                    {!col.length && <small className="muted" style={{ padding: '4px 2px' }}>Ninguno</small>}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {abierto && (
        <div className="pd-fondo" onClick={() => setAbierto(null)}>
          <aside className="pd-cajon" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Pedido ${numeroPedido(abierto.numero)}`}>
            <div className="pd-cajon-h">
              <div><b>{abierto.cliente}</b><small className="pd-sub">{abierto.telefono} · {nombreDocumento(abierto.doc_tipo)} {abierto.doc_numero ?? 'pendiente'}</small></div>
              <div className="row" style={{ gap: 6 }}>
                <Link className="btn chico" href={`/leads/${abierto.lead_id}`}>Abrir ficha</Link>
                <button className="btn chico" onClick={() => setAbierto(null)} aria-label="Cerrar">✕</button>
              </div>
            </div>
            <div className="pd-cajon-b">
              <PedidoCliente key={abierto.id} lead={abierto.lead_id} alistamientoId={abierto.id} compacto puedeDocumento={puedeDocumento}
                puedeCorregir={puedeCorregir} puedePagos={puedePagos} puedeEliminar={puedeEliminar} embudos={embudos} etapas={etapas} version={version}
                alCambiar={() => { setVersion((v) => v + 1); router.refresh() }} />
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}
