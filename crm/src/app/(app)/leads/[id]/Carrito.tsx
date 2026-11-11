'use client'

import { useEffect, useMemo, useState } from 'react'
import { pesos } from '@/lib/inventario'
import { enviarCarrito, guardarCarrito, inventarioCarrito, leerCarrito, type Carrito, type EquipoInventario, type ItemCarrito } from './carritoAcciones'

// F4·72 (docs/CARRITO-DEL-ASESOR.md, RCA-01 a RCA-10): el asesor arma el pedido del cliente en la Ficha y se lo envía.
// Equipos del inventario (con stock), renglones libres, precios (con el permiso modificar_precios), configuración y tipo de cliente.
const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const MAXIMO = 10

export function CarritoCliente({ lead, alEnviar }: { lead: number; alEnviar?: () => void }) {
  const [base, setBase] = useState<Carrito | null>(null)
  const [items, setItems] = useState<ItemCarrito[]>([])
  const [tipo, setTipo] = useState<Carrito['tipo']>(null)
  const [sinConfig, setSinConfig] = useState(false)
  const [inventario, setInventario] = useState<EquipoInventario[] | null>(null)
  const [buscar, setBuscar] = useState('')
  const [libre, setLibre] = useState<{ equipo: string; precio: string } | null>(null)
  const [aviso, setAviso] = useState<{ error?: string; ok?: string }>({})
  const [ocupado, setOcupado] = useState(false)
  const [cambiado, setCambiado] = useState(false)

  function cargarDe(c: Carrito) {
    setBase(c); setItems(c.items); setTipo(c.tipo); setSinConfig(c.sin_configuracion); setCambiado(false)
  }
  useEffect(() => {
    leerCarrito(lead).then((r) => (r.carrito ? cargarDe(r.carrito) : setAviso({ error: r.error })))
    inventarioCarrito().then((r) => setInventario(r.equipos))
  }, [lead])

  const porCodigo = useMemo(() => new Map((inventario ?? []).map((e) => [e.codigo.toUpperCase(), e])), [inventario])
  const palabras = limpio(buscar).split(/\s+/).filter(Boolean)
  const ya = new Set(items.map((i) => i.codigo.toUpperCase()))
  const sugeridos = palabras.length === 0 ? [] : (inventario ?? [])
    .filter((e) => !ya.has(e.codigo.toUpperCase()))
    .filter((e) => { const d = limpio(`${e.codigo} ${e.equipo} ${e.detalle} ${e.estado ?? ''}`); return palabras.every((p) => d.includes(p)) })
    .slice(0, 8)

  // RCA-05: la configuración, como en la compra del bot (cliente final con un equipo usado del inventario); la casilla la quita.
  const usados = items.some((i) => !i.libre && (i.usado ?? !limpio(porCodigo.get(i.codigo.toUpperCase())?.estado ?? '').startsWith('nuevo')))
  const aplica = tipo === 'Cliente final' && usados
  const valorConfig = base?.valor_configuracion ?? 0
  const cargo = aplica && !sinConfig ? valorConfig : 0
  const subtotal = items.reduce((s, i) => s + (Number(i.precio) || 0), 0)
  const puedePrecios = !!base?.puede_precios
  const lleno = items.length >= MAXIMO

  function cambiar(nuevos: ItemCarrito[]) { setItems(nuevos); setCambiado(true); setAviso({}) }
  function agregar(e: EquipoInventario) {
    if (lleno) return
    cambiar([...items, { codigo: e.codigo, equipo: e.equipo, precio: Number(e.precio), precio_base: Number(e.precio), estado: e.estado, stock: e.stock,
      usado: !limpio(e.estado ?? '').startsWith('nuevo') }])
    setBuscar('')
  }
  function agregarLibre() {
    if (!libre || lleno) return
    const precio = Number(libre.precio.replace(/[^\d]/g, ''))
    if (!libre.equipo.trim() || !precio) { setAviso({ error: 'Escribe el nombre y el precio del producto.' }); return }
    cambiar([...items, { codigo: `LIBRE-${Date.now()}`, equipo: libre.equipo.trim().slice(0, 80), precio, libre: true }])
    setLibre(null)
  }

  async function hacer(enviar: boolean) {
    if (enviar && !confirm(`¿Enviar el carrito al cliente? Total ${pesos(subtotal + cargo)}. El bot atiende la compra y, si pide asesor, vuelve a ti.`)) return
    setOcupado(true)
    const r = enviar ? await enviarCarrito(lead, items, tipo, sinConfig) : await guardarCarrito(lead, items, tipo, sinConfig)
    setOcupado(false)
    if (r.carrito) cargarDe(r.carrito)
    setAviso({ error: r.error, ok: r.ok })
    if (enviar && !r.error) alEnviar?.()
  }

  if (!base) return <small className="muted">{aviso.error ?? 'Cargando el carrito…'}</small>

  return (
    <div className="carrito">
      <div className="carrito-cab">
        <b>🛒 Carrito del cliente</b>
        <div className="row" role="radiogroup" aria-label="Tipo de cliente" style={{ gap: 6 }}>
          {(['Cliente final', 'Distribuidor'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} className={`btn chico${tipo === t ? ' primary' : ''}`}
              onClick={() => { setTipo(t); setCambiado(true) }}>{t}</button>
          ))}
        </div>
      </div>

      <div className="carrito-buscar">
        <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} disabled={lleno}
          placeholder={lleno ? `Máximo ${MAXIMO} productos` : inventario === null ? 'Cargando inventario…' : '🔍 Agregar del inventario: código, marca, modelo, procesador…'}
          onKeyDown={(e) => { if (e.key === 'Enter' && sugeridos[0]) { e.preventDefault(); agregar(sugeridos[0]) } }} />
        {sugeridos.length > 0 && (
          <div className="carrito-sugeridos" role="listbox" aria-label="Equipos con stock">
            {sugeridos.map((e) => (
              <button key={e.codigo} type="button" role="option" aria-selected={false} onClick={() => agregar(e)}>
                <b>{e.equipo}</b> <span className="muted">· {e.codigo} · {e.detalle}{e.estado ? ` · ${e.estado}` : ''}</span>
                <span className="carrito-precio">{pesos(Number(e.precio))}</span>
              </button>
            ))}
          </div>
        )}
        {palabras.length > 0 && sugeridos.length === 0 && inventario !== null && <small className="muted">Nada con «{buscar}» entre los equipos con stock.</small>}
      </div>

      {items.length === 0 && <small className="muted">El carrito está vacío. Busca un equipo o agrega un producto fuera del inventario.</small>}
      <div className="carrito-items">
        {items.map((i, k) => {
          const cambiadoPrecio = !i.libre && i.precio_base != null && Number(i.precio) !== Number(i.precio_base)
          const sinStock = !i.libre && i.stock !== undefined && i.stock <= 0
          return (
            <div key={i.codigo} className={`carrito-item${sinStock ? ' agotado' : ''}`}>
              <span aria-hidden>{i.libre ? '📦' : '💻'}</span>
              <div className="carrito-nombre">
                <b>{i.equipo}</b>
                <small className="muted">{i.libre ? 'Fuera del inventario · sin stock ni servicio técnico' : `${i.codigo}${i.estado ? ` · ${i.estado}` : ''}`}
                  {sinStock && <span className="error"> · sin stock: quítalo para enviar</span>}</small>
              </div>
              <div className="carrito-valor">
                <input inputMode="numeric" aria-label={`Precio de ${i.equipo}`} disabled={!i.libre && !puedePrecios}
                  title={!i.libre && !puedePrecios ? 'Tu rol no puede cambiar precios (permiso «Modificar precios»)' : undefined}
                  value={Number(i.precio) ? Number(i.precio).toLocaleString('es-CO') : ''}
                  onChange={(e) => cambiar(items.map((x, j) => (j === k ? { ...x, precio: Number(e.target.value.replace(/[^\d]/g, '')) || 0 } : x)))} />
                {cambiadoPrecio && <small className="muted">base {pesos(Number(i.precio_base))}</small>}
              </div>
              <button type="button" className="iconbtn" aria-label={`Quitar ${i.equipo}`} onClick={() => cambiar(items.filter((_, j) => j !== k))}>✕</button>
            </div>
          )
        })}
      </div>

      {libre ? (
        <div className="carrito-libre">
          <input autoFocus placeholder="Producto (p. ej. Mouse inalámbrico)" maxLength={80} value={libre.equipo}
            onChange={(e) => setLibre({ ...libre, equipo: e.target.value })} />
          <input inputMode="numeric" placeholder="Precio" value={libre.precio ? Number(libre.precio.replace(/[^\d]/g, '') || 0).toLocaleString('es-CO') : ''}
            onChange={(e) => setLibre({ ...libre, precio: e.target.value.replace(/[^\d]/g, '') })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarLibre() } }} />
          <button type="button" className="btn chico primary" onClick={agregarLibre}>Agregar</button>
          <button type="button" className="btn chico" onClick={() => setLibre(null)}>Cancelar</button>
        </div>
      ) : (
        <button type="button" className="btn-link" disabled={lleno} onClick={() => setLibre({ equipo: '', precio: '' })}>+ Producto que no está en el inventario</button>
      )}

      <div className="carrito-totales">
        {aplica && (
          <label className="inline">
            <input type="checkbox" checked={!sinConfig} onChange={(e) => { setSinConfig(!e.target.checked); setCambiado(true) }} />
            🔧 Configuración (1 vez por pedido) <span className="carrito-precio">{pesos(valorConfig)}</span>
          </label>
        )}
        <div className="carrito-total"><span>Total ({items.length} {items.length === 1 ? 'producto' : 'productos'})</span><b>{pesos(subtotal + cargo)}</b></div>
      </div>

      {aviso.error && <div className="aviso bad" role="alert">{aviso.error}</div>}
      {aviso.ok && <div className="aviso ok">{aviso.ok}</div>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn chico" disabled={ocupado || !cambiado} onClick={() => hacer(false)}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn chico primary" disabled={ocupado || items.length === 0 || !tipo} onClick={() => hacer(true)}
          title={!tipo ? 'Elige si es cliente final o distribuidor' : 'El cliente recibe el resumen con «Sí, confirmar»'}>📤 Enviar al cliente</button>
        <button type="button" className="btn chico" disabled={ocupado || items.length === 0}
          onClick={() => confirm('¿Vaciar el carrito?') && cambiar([])}>Vaciar</button>
        {cambiado && <small className="muted">Sin guardar</small>}
      </div>
      {base.enviado_en && (
        <small className="muted">Último envío: {new Date(base.enviado_en).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
          {base.enviado_por ? ` por ${base.enviado_por}` : ''}</small>
      )}
    </div>
  )
}
