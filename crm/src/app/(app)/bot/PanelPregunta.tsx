'use client'

import { useRef, useState, useTransition } from 'react'
import { borrarCuadro, guardarPregunta, type Resultado } from './acciones'
import type { Cuadro, DatoFicha } from './Lienzo'
import { MAX_ESPERA, textoEspera } from './PanelPausa'
import { VistaWhatsApp } from './VistaWhatsApp'

// Cómo valida el bot cada tipo de dato (flujo.limpiar_respuesta, RF-24): se le muestra al dueño para que escriba un buen mensaje de error.
const VALIDA: Record<string, string> = {
  documento: 'Quita puntos, espacios y guiones; de 5 a 12 números.',
  telefono: 'Quita espacios y el +57; 10 números que empiezan por 3.',
  correo: 'Debe tener @ y dominio; se guarda en minúsculas.',
  lista: 'Muestra las opciones como botones y acepta el número o el texto de una.',
  numero: 'Debe ser un número.',
  moneda: 'Un monto: «1.500.000», «1,5 millones»…',
  fecha: 'Una fecha: 25/12/2026 o 2026-12-25.',
  enlace: 'Debe empezar por http:// o https://.',
  texto_largo: 'Cualquier respuesta de hasta 4.000 caracteres.',
}

// Botón «Insertar dato» (RF-26): pone {clave} donde está el cursor del texto.
export function InsertarDato({ datos, alInsertar, deshabilitado }: { datos: DatoFicha[]; alInsertar: (marca: string) => void; deshabilitado?: boolean }) {
  return (
    <select aria-label="Insertar dato de la ficha" value="" disabled={deshabilitado} className="chico"
      onChange={(e) => { if (e.target.value) alInsertar(`{${e.target.value}}`) }}>
      <option value="">+ Insertar dato…</option>
      {datos.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
    </select>
  )
}

export function insertarEn(area: HTMLTextAreaElement | null, texto: string, marca: string) {
  const i = area?.selectionStart ?? texto.length
  const f = area?.selectionEnd ?? texto.length
  return texto.slice(0, i) + marca + texto.slice(f)
}

// La vista previa cambia {clave} por un ejemplo con el nombre del dato.
export const conEjemplos = (texto: string, datos: DatoFicha[]) =>
  datos.reduce((t, d) => t.replaceAll(`{${d.clave}}`, `‹${d.nombre}›`), texto)

// Panel del cuadro Pregunta (F4·34, RF-23 a RF-25).
export function PanelPregunta({ bot, cuadro, destinos, datos, editable, alTerminar }: {
  bot: number
  cuadro: Cuadro
  destinos: Cuadro[]
  datos: DatoFicha[]
  editable: boolean
  alTerminar: (r: Resultado, borrado?: boolean) => void
}) {
  const a = cuadro.ajustes ?? {}
  const [nombre, setNombre] = useState(cuadro.nombre)
  const [texto, setTexto] = useState(cuadro.texto)
  const [atributo, setAtributo] = useState(String(a.atributo ?? ''))
  const [textoError, setTextoError] = useState(String(a.texto_error ?? ''))
  const [espera, setEspera] = useState(Number(a.espera_segundos ?? 1800))
  const [siguiente, setSiguiente] = useState<string | null>(cuadro.salidas?.siguiente ?? null)
  const [sinRespuesta, setSinRespuesta] = useState<string | null>(cuadro.salidas?.sin_respuesta ?? null)
  const [noLogro, setNoLogro] = useState<string | null>(cuadro.salidas?.no_logro ?? null)
  const [ocupado, iniciar] = useTransition()
  const area = useRef<HTMLTextAreaElement>(null)
  // Los sí/no y las de varias opciones se marcan con botones (RF-27), no se preguntan.
  const preguntables = datos.filter((d) => d.tipo !== 'si_no' && d.tipo !== 'multiseleccion')
  const elegido = datos.find((d) => d.clave === atributo)
  const h = Math.floor(espera / 3600), m = Math.floor((espera % 3600) / 60)
  const motivos = [
    !texto.trim() && 'Escribe la pregunta.',
    texto.length > 1024 && 'La pregunta pasa de 1.024 caracteres.',
    !textoError.trim() && 'Escribe el mensaje para cuando la respuesta no sirve.',
    (espera < 60 || espera > MAX_ESPERA) && 'La espera de «Sin respuesta» va de 1 minuto a 23 h 59 min.',
  ].filter(Boolean) as string[]

  const destino = (valor: string | null, cambiar: (v: string | null) => void, etiqueta: string, ayuda?: string) => (
    <label className="field">{etiqueta}
      <select value={valor ?? ''} disabled={!editable || ocupado} onChange={(e) => cambiar(e.target.value || null)}>
        <option value="">{ayuda ?? '— sin destino —'}</option>
        {destinos.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
      </select>
    </label>
  )

  return (
    <div className="lienzo-panel">
      <div className="lienzo-panel-h">
        <div><b>{cuadro.nombre}</b><small className="muted"> · {cuadro.clave}</small></div>
        <small className="muted">❓ Pregunta</small>
      </div>
      {!editable && <div className="aviso">Estás viendo la versión publicada. Para cambiar el flujo, abre un borrador.</div>}
      <small className="muted">
        Pregunta algo y guarda la respuesta en la ficha del cliente. Si no sirve, manda tu mensaje de error y vuelve a esperar; al tercer
        intento sigue por «No logró responder». «asesor» o 9 siguen pasando al asesor.
      </small>
      {editable && <label className="field">Nombre en el lienzo<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} /></label>}
      <label className="field">Pregunta
        <textarea ref={area} rows={3} value={texto} maxLength={1024} disabled={!editable || ocupado} onChange={(e) => setTexto(e.target.value)} />
        <span className="row contador">
          {editable && <InsertarDato datos={datos} deshabilitado={ocupado} alInsertar={(mk) => setTexto(insertarEn(area.current, texto, mk))} />}
          <small className="muted mono">{texto.length.toLocaleString('es-CO')} / 1.024</small>
        </span>
      </label>
      <label className="field">Guarda la respuesta en
        <select value={atributo} disabled={!editable || ocupado} onChange={(e) => setAtributo(e.target.value)}>
          <option value="">— elige un dato de la ficha —</option>
          {preguntables.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
        </select>
        {elegido && <small className="muted">{VALIDA[elegido.tipo] ?? 'Cualquier respuesta de hasta 300 caracteres.'}</small>}
        {!atributo && <small className="bad">Elige el dato: sin él no se puede publicar.</small>}
      </label>
      <label className="field">Si la respuesta no sirve, responde
        <textarea rows={2} value={textoError} maxLength={1024} disabled={!editable || ocupado} onChange={(e) => setTextoError(e.target.value)} />
      </label>
      {destino(siguiente, setSiguiente, 'Respondió bien, sigue a')}
      {destino(noLogro, setNoLogro, 'No logró responder (3 intentos), sigue a', '— sin unir: pasa al asesor —')}
      {destino(sinRespuesta, setSinRespuesta, `Sin respuesta en ${textoEspera(espera).replace(/ 0 s$/, '')}, sigue a`, '— sin unir: pasa al asesor —')}
      <fieldset className="pausa-tiempo" disabled={!editable || ocupado}>
        <legend>Esperar la respuesta</legend>
        <label><input type="number" min={0} max={23} value={h} aria-label="Horas"
          onChange={(e) => setEspera(Math.max(0, Math.min(23, Number(e.target.value) || 0)) * 3600 + m * 60)} /> h</label>
        <label><input type="number" min={0} max={59} value={m} aria-label="Minutos"
          onChange={(e) => setEspera(h * 3600 + Math.max(0, Math.min(59, Number(e.target.value) || 0)) * 60)} /> min</label>
      </fieldset>
      <div className="lienzo-vista">
        <strong>Así lo ve el cliente</strong>
        <VistaWhatsApp cuerpo={conEjemplos(texto, datos)} forma={elegido?.tipo === 'lista' ? 'botones' : 'texto'}
          opciones={elegido?.tipo === 'lista' ? (elegido.opciones ?? []).map((o, i) => ({ id: String(i + 1), titulo: o })) : []} numerar />
      </div>
      {editable && (
        <div className="row">
          <button className="btn primary" data-guardar data-accion="guardar" disabled={ocupado || motivos.length > 0}
            onClick={() => iniciar(async () => alTerminar(await guardarPregunta(bot, cuadro.clave,
              { nombre, texto, atributo: atributo || null, textoError, siguiente, sinRespuesta, noLogro, espera })))}>
            {ocupado ? 'Guardando…' : 'Guardar en el borrador'}
          </button>
          <button className="btn peligro" data-guardar disabled={ocupado}
            onClick={() => confirm(`¿Borrar el cuadro ${cuadro.nombre} del borrador? Las flechas que llegan quedan sueltas.`)
              && iniciar(async () => alTerminar(await borrarCuadro(bot, cuadro.clave), true))}>Borrar cuadro</button>
        </div>
      )}
      {editable && motivos.length > 0 && <div className="aviso bad" role="alert">Aún no se puede guardar: {motivos.join(' ')}</div>}
    </div>
  )
}
