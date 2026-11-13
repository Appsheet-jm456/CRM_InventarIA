'use client'

// F4·75 · Tarjeta «Tienda web» en Inventario → Catálogos (docs/TIENDA-WEB-EN-FICHAS.md).
import { useFormState, useFormStatus } from 'react-dom'
import { guardarTiendaWeb, type Resultado } from '../acciones'
import type { TiendaWeb } from '@/lib/tiendaWeb'

function Guardar() {
  const { pending } = useFormStatus()
  return <button className="btn primary chico" disabled={pending}>{pending ? 'Guardando…' : 'Guardar'}</button>
}

export function FormTiendaWeb({ tienda, publicados, administra }: { tienda: TiendaWeb; publicados: number | null; administra: boolean }) {
  const [estado, accion] = useFormState<Resultado, FormData>(guardarTiendaWeb, {})
  return (
    <section className="panel">
      <div className="panel-h">
        <div><h2>🌐 Tienda web</h2>
          <small>El bot agrega al final de cada ficha el enlace a la página del equipo en la tienda; si el equipo aún no está publicado, el catálogo web.</small></div>
        <span className={`chip ${!tienda.activa ? 'neu' : publicados === null ? 'warn' : 'ok'}`}>
          {!tienda.activa ? 'Apagada' : publicados === null ? 'La tienda no respondió' : `${publicados} ${publicados === 1 ? 'equipo publicado' : 'equipos publicados'}`}
        </span>
      </div>
      <form action={accion} className="panel-b form-tienda">
        <label className="solo-disponibles"><input type="checkbox" name="activa" defaultChecked={tienda.activa} disabled={!administra} /> Enviar el enlace de la tienda en las fichas</label>
        <label>Dirección de la tienda<input name="url" defaultValue={tienda.url} disabled={!administra} placeholder="https://ventasvirtualcolombia.com" /></label>
        <label>Catálogo web (si el equipo no está publicado)<input name="catalogo_url" defaultValue={tienda.catalogo_url} disabled={!administra} placeholder="https://ventasvirtualcolombia.com/productos?categoria=portatil" /></label>
        <label>Texto con el equipo publicado<input name="texto_equipo" defaultValue={tienda.texto_equipo} disabled={!administra} maxLength={200} /></label>
        <label>Texto con el catálogo<input name="texto_catalogo" defaultValue={tienda.texto_catalogo} disabled={!administra} maxLength={200} /></label>
        <small className="muted">{'{enlace}'} se cambia por la dirección. La lista de publicados se lee de la página «productos» de la tienda cada 5 minutos.</small>
        {estado.error && <div className="aviso bad">{estado.error}</div>}
        {estado.ok && <div className="aviso ok">{estado.ok}</div>}
        {administra && <div><Guardar /></div>}
      </form>
    </section>
  )
}
