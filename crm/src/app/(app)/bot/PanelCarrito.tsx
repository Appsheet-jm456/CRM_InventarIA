'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { borrarCuadro, guardarCarrito, type Resultado } from './acciones'
import type { Cuadro } from './Lienzo'
import { VistaWhatsApp } from './VistaWhatsApp'

// Panel del cuadro 🛒 Carrito (F4·44, RAG-55): empieza la compra con carrito desde el lienzo. Los textos del carrito y el máximo
// están en Agente → Compra → Carrito; aquí van el mensaje de entrada y a dónde sigue.
export function PanelCarrito({ bot, cuadro, destinos, editable, alTerminar }: {
  bot: number
  cuadro: Cuadro
  destinos: Cuadro[]
  editable: boolean
  alTerminar: (r: Resultado, borrado?: boolean) => void
}) {
  const [nombre, setNombre] = useState(cuadro.nombre)
  const [texto, setTexto] = useState(cuadro.texto)
  const [listo, setListo] = useState<string | null>(cuadro.salidas?.listo ?? null)
  const [asesor, setAsesor] = useState<string | null>(cuadro.salidas?.asesor ?? null)
  const [ocupado, iniciar] = useTransition()

  const salida = (valor: string | null, poner: (v: string | null) => void, etiqueta: string, suelta: string) => (
    <label className="field">{etiqueta}
      <select value={valor ?? ''} disabled={!editable || ocupado} onChange={(e) => poner(e.target.value || null)}>
        <option value="">{suelta}</option>
        {destinos.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
      </select>
    </label>
  )

  return (
    <div className="lienzo-panel">
      <div className="lienzo-panel-h">
        <div><b>{cuadro.nombre}</b><small className="muted"> · {cuadro.clave}</small></div>
        <small className="muted">🛒 Carrito</small>
      </div>
      {!editable && <div className="aviso">Estás viendo la versión publicada. Para cambiar el flujo, abre un borrador.</div>}
      <small className="muted">
        Desde aquí el cliente compra uno o varios equipos: toma el de la última ficha (o lo pide), pregunta «¿otro equipo?», arma el resumen con
        el total y sigue con las cuentas y el comprobante. Los textos del carrito y el máximo de equipos están
        en <Link href="/agente/compra">Agente → Compra → Carrito</Link>; este cuadro los usa aunque la casilla esté apagada.
      </small>
      {editable && <label className="field">Nombre en el lienzo<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} /></label>}
      <label className="field">Mensaje de entrada (opcional)
        <textarea rows={2} value={texto} maxLength={1024} disabled={!editable || ocupado} onChange={(e) => setTexto(e.target.value)}
          placeholder="🛒 ¡Perfecto! Armemos tu pedido." />
      </label>
      {salida(listo, setListo, 'Pedido pagado (comprobante recibido), sigue a',
        '— sin unir: lo de Agente → Compra (bot después del comprobante o asesor) —')}
      {salida(asesor, setAsesor, 'Pidió asesor, sigue a', '— sin unir: pasa al asesor con el pedido anotado —')}
      {texto.trim() && (
        <div className="lienzo-vista">
          <strong>Así lo ve el cliente al entrar</strong>
          <VistaWhatsApp cuerpo={texto} forma="texto" opciones={[]} numerar />
        </div>
      )}
      {editable && (
        <div className="row">
          <button className="btn primary" data-guardar data-accion="guardar" disabled={ocupado}
            onClick={() => iniciar(async () => alTerminar(await guardarCarrito(bot, cuadro.clave, { nombre, texto, listo, asesor })))}>
            {ocupado ? 'Guardando…' : 'Guardar en el borrador'}
          </button>
          <button className="btn peligro" data-guardar disabled={ocupado}
            onClick={() => confirm(`¿Borrar el cuadro ${cuadro.nombre} del borrador? Las flechas que llegan quedan sueltas.`)
              && iniciar(async () => alTerminar(await borrarCuadro(bot, cuadro.clave), true))}>Borrar cuadro</button>
        </div>
      )}
    </div>
  )
}
