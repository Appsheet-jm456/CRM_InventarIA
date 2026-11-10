'use client'

import { useEffect, useRef, useState } from 'react'
import { responderConArchivo, type Resultado } from './acciones'

// F4·62 (RB-13 a RB-18): emojis y archivos en el chat (Bandeja y Ficha → Chat).
// 😊 abre el selector (con buscador y recientes) e inserta donde está el cursor. 📎, arrastrar al chat o pegar con Ctrl+V
// adjuntan un archivo: se ve antes de enviar, con un pie opcional. La acción del servidor revisa formato, tamaño y las 24 h.

const GRUPOS: { titulo: string; emojis: [string, string][] }[] = [
  { titulo: 'Caras', emojis: [
    ['😊', 'feliz sonrisa'], ['😀', 'feliz'], ['😁', 'sonrisa dientes'], ['😂', 'risa llorar'], ['🤣', 'risa'], ['😅', 'nervios sudor'],
    ['😉', 'guiño'], ['😍', 'enamorado amor'], ['🥰', 'amor cariño'], ['😘', 'beso'], ['😎', 'genial gafas'], ['🤩', 'wow estrella'],
    ['🤗', 'abrazo'], ['🤔', 'pensar duda'], ['🙄', 'ojos'], ['😐', 'serio'], ['😮', 'sorpresa'], ['😴', 'sueño'], ['😢', 'triste'],
    ['😭', 'llorar'], ['😡', 'enojo bravo'], ['🥳', 'fiesta celebrar'], ['😇', 'angel'], ['🙃', 'al reves'], ['😬', 'incómodo'],
    ['🤝', 'trato acuerdo mano'], ['🙏', 'gracias por favor'], ['👏', 'aplausos'], ['🙌', 'celebrar manos'], ['💪', 'fuerza'],
  ] },
  { titulo: 'Manos', emojis: [
    ['👍', 'bien ok si'], ['👎', 'mal no'], ['👌', 'perfecto ok'], ['✌️', 'paz'], ['🤞', 'suerte'], ['👋', 'hola adios saludo'],
    ['👉', 'aqui derecha'], ['👈', 'izquierda'], ['👆', 'arriba'], ['👇', 'abajo'], ['☝️', 'atencion uno'], ['✋', 'alto espera'],
  ] },
  { titulo: 'Ventas', emojis: [
    ['💻', 'portatil computador laptop'], ['🖥️', 'computador torre escritorio'], ['⌨️', 'teclado'], ['🖱️', 'mouse raton'],
    ['🖨️', 'impresora'], ['📱', 'celular telefono'], ['🎮', 'gamer juego'], ['🔋', 'bateria'], ['🔌', 'cargador'], ['💾', 'disco'],
    ['🧠', 'ram memoria'], ['🚀', 'rapido potente'], ['⚙️', 'configuracion'], ['🛠️', 'servicio tecnico reparar'], ['🔧', 'arreglo'],
    ['💰', 'dinero precio'], ['💵', 'efectivo pago'], ['💳', 'tarjeta pago'], ['🏦', 'banco transferencia'], ['🧾', 'factura recibo'],
    ['📦', 'envio paquete despacho'], ['🚚', 'transporte envio domicilio'], ['🏪', 'tienda local'], ['📍', 'ubicacion direccion'],
    ['🗺️', 'mapa'], ['🕐', 'hora horario'], ['📅', 'fecha calendario'], ['🛒', 'carrito compra'], ['🏷️', 'etiqueta precio oferta'],
    ['🎁', 'regalo'], ['🔥', 'oferta caliente'], ['⭐', 'estrella'], ['✨', 'nuevo brillo'], ['💯', 'cien'], ['🆕', 'nuevo'],
    ['📚', 'catalogo'], ['📄', 'documento'], ['📎', 'adjunto'], ['📸', 'foto'], ['🎥', 'video'], ['📞', 'llamar'], ['💬', 'mensaje chat'],
    ['📲', 'whatsapp celular'], ['📧', 'correo'], ['🔒', 'seguro'], ['🛡️', 'garantia'], ['🔄', 'cambio devolucion'], ['🤖', 'bot asesor'],
  ] },
  { titulo: 'Símbolos', emojis: [
    ['✅', 'listo hecho si'], ['❌', 'no error'], ['⚠️', 'atencion cuidado'], ['❗', 'importante'], ['❓', 'pregunta'], ['💡', 'idea recuerda'],
    ['❤️', 'corazon amor'], ['💙', 'azul corazon'], ['🎉', 'fiesta celebrar'], ['🎊', 'celebrar'], ['🏆', 'ganador'], ['🥇', 'primero'],
    ['1️⃣', 'uno'], ['2️⃣', 'dos'], ['3️⃣', 'tres'], ['4️⃣', 'cuatro'], ['5️⃣', 'cinco'], ['🔹', 'punto'], ['▶️', 'siguiente'], ['🇨🇴', 'colombia'],
  ] },
]
const TODOS = GRUPOS.flatMap((g) => g.emojis)
const CLAVE_RECIENTES = 'crm-emojis-recientes'
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function leerRecientes(): string[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? '[]').slice(0, 16) } catch { return [] }
}

const ACEPTA = 'image/jpeg,image/png,video/mp4,video/3gpp,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'

export function useAdjuntos({ lead, activo, setTexto, area, alEnviar }: {
  lead: number; activo: boolean; setTexto: (f: (t: string) => string) => void
  area: React.RefObject<HTMLTextAreaElement>; alEnviar: (r: Resultado) => void
}) {
  const [emojis, setEmojis] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [recientes, setRecientes] = useState<string[]>([])
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vista, setVista] = useState('')
  const [pie, setPie] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [encima, setEncima] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { setRecientes(leerRecientes()) }, [])
  useEffect(() => { setArchivo(null); setEmojis(false); setPie('') }, [lead])
  useEffect(() => {
    if (!archivo || !/^(image|video|audio)\//.test(archivo.type)) { setVista(''); return }
    const url = URL.createObjectURL(archivo)
    setVista(url)
    return () => URL.revokeObjectURL(url)
  }, [archivo])

  function insertar(e: string) {
    const t = area.current
    const ini = t?.selectionStart ?? null
    const fin = t?.selectionEnd ?? null
    setTexto((actual) => ini === null || fin === null ? actual + e : actual.slice(0, ini) + e + actual.slice(fin))
    requestAnimationFrame(() => {
      if (!t) return
      const pos = (ini ?? t.value.length) + e.length
      t.focus(); t.setSelectionRange(pos, pos)
    })
    const nuevos = [e, ...recientes.filter((x) => x !== e)].slice(0, 16)
    setRecientes(nuevos)
    try { localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(nuevos)) } catch { /* sin almacenamiento: no pasa nada */ }
  }

  function elegirArchivo(f: File | null | undefined) {
    if (!f || !activo) return
    setEmojis(false); setArchivo(f); setPie('')
  }

  async function enviar() {
    if (!archivo || enviando) return
    setEnviando(true)
    const datos = new FormData()
    datos.append('archivo', archivo)
    datos.append('pie', pie)
    let r: Resultado
    try {
      r = await responderConArchivo(lead, datos)
    } catch {
      r = { error: 'No se pudo subir: el archivo pesa más de lo que deja la app (21 MB) o se cortó la conexión.' }
    }
    setEnviando(false)
    if (!r.error) { setArchivo(null); setPie('') }
    alEnviar(r)
  }

  const palabras = sinTildes(buscar).split(/\s+/).filter(Boolean)
  const encontrados = palabras.length ? TODOS.filter(([, n]) => palabras.every((p) => sinTildes(n).split(' ').some((w) => w.startsWith(p)))) : []

  const botones = activo ? (
    <>
      <button type="button" className="btn" title="Emojis" aria-label="Emojis" aria-expanded={emojis} onClick={() => { setArchivo(null); setEmojis(!emojis) }}>😊</button>
      <button type="button" className="btn" title="Adjuntar imagen, documento, video o audio (también arrastrando o con Ctrl+V)" aria-label="Adjuntar archivo"
        onClick={() => input.current?.click()}>📎</button>
      <input ref={input} type="file" hidden accept={ACEPTA} onChange={(e) => { elegirArchivo(e.target.files?.[0]); e.target.value = '' }} />
    </>
  ) : null

  const peso = archivo ? (archivo.size >= 1024 * 1024 ? `${(archivo.size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(archivo.size / 1024)} KB`) : ''
  const panel = archivo ? (
    <div className="adj-previa" role="dialog" aria-label="Enviar archivo">
      <div className="adj-cosa">
        {archivo.type.startsWith('image/') && vista && <img src={vista} alt="Vista previa" />}
        {archivo.type.startsWith('video/') && vista && <video src={vista} controls preload="metadata" />}
        {archivo.type.startsWith('audio/') && vista && <audio src={vista} controls preload="metadata" />}
        <small><b>{archivo.name}</b> · {peso}</small>
      </div>
      <input type="text" placeholder={archivo.type.startsWith('audio/') ? 'Texto aparte (opcional)' : 'Pie de foto o mensaje (opcional)'} value={pie} maxLength={1024}
        onChange={(e) => setPie(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enviar() } else if (e.key === 'Escape') setArchivo(null) }} />
      <div className="row">
        <button type="button" className="btn primary chico" disabled={enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar al cliente'}</button>
        <button type="button" className="btn chico" disabled={enviando} onClick={() => setArchivo(null)}>Cancelar</button>
        <small className="muted">Imagen 5 MB · video y audio 16 MB · documento 20 MB</small>
      </div>
    </div>
  ) : emojis ? (
    <div className="adj-emojis" role="dialog" aria-label="Emojis">
      <input type="search" placeholder="Buscar: precio, envío, gracias…" value={buscar} onChange={(e) => setBuscar(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === 'Escape') setEmojis(false); else if (e.key === 'Enter' && encontrados[0]) { e.preventDefault(); insertar(encontrados[0][0]) } }} />
      <div className="adj-rejilla">
        {palabras.length ? (
          encontrados.length ? encontrados.map(([e, n]) => <button key={e} type="button" title={n} onClick={() => insertar(e)}>{e}</button>)
            : <small className="muted">Nada con «{buscar}».</small>
        ) : (
          <>
            {recientes.length > 0 && <><small>Recientes</small>{recientes.map((e) => <button key={`r${e}`} type="button" onClick={() => insertar(e)}>{e}</button>)}</>}
            {GRUPOS.map((g) => (
              <span key={g.titulo} style={{ display: 'contents' }}>
                <small>{g.titulo}</small>
                {g.emojis.map(([e, n]) => <button key={e} type="button" title={n} onClick={() => insertar(e)}>{e}</button>)}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  ) : null

  // Arrastrar un archivo sobre el chat o pegarlo (Ctrl+V) en la caja.
  const zona = {
    onDragOver: (e: React.DragEvent) => { if (activo && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setEncima(true) } },
    onDragLeave: () => setEncima(false),
    onDrop: (e: React.DragEvent) => { setEncima(false); if (activo && e.dataTransfer.files[0]) { e.preventDefault(); elegirArchivo(e.dataTransfer.files[0]) } },
  }
  const alPegar = (e: React.ClipboardEvent) => {
    const f = Array.from(e.clipboardData.files)[0]
    if (activo && f) { e.preventDefault(); elegirArchivo(f) }
  }

  return { botones, panel, zona, alPegar, encima }
}
