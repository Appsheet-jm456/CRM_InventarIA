'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  FUENTES, FUENTE_MARCA, MARCA, TEMAS, avisosContraste, cssApariencia, esColor, urlLogo,
  type Apariencia, type Colores, type Fuente,
} from '@/lib/marca'
import { guardarApariencia, guardarModoOscuro, quitarLogo, type Resultado } from './acciones'

type Props = { apariencia: Apariencia; oscuro: boolean | null; editar: boolean }
type Elegido = Record<keyof Colores, string> & { fuente: Fuente }

const CAMPOS: [keyof Colores, string, string][] = [
  ['panel', 'Panel lateral', 'Fondo del menú de módulos y del login'],
  ['principal', 'Principal', 'Botones, enlaces y módulo activo'],
  ['acento', 'Acento de marca', 'Indicador del módulo activo y punto del logo'],
]

const desdeBase = (a: Apariencia): Elegido => ({
  panel: a.panel ?? MARCA.panel,
  principal: a.principal ?? MARCA.principal,
  acento: a.acento ?? MARCA.acento,
  fuente: a.fuente ?? FUENTE_MARCA,
})

function BotonGuardar({ sucio }: { sucio: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button className="btn primary" disabled={!sucio || pending}>
      {pending ? 'Guardando…' : 'Guardar'}
    </button>
  )
}

export function FormApariencia({ apariencia, oscuro, editar }: Props) {
  return (
    <>
      <ModoPantalla oscuro={oscuro} />
      {editar ? (
        <Marca apariencia={apariencia} />
      ) : (
        <p className="aviso">El logo, los colores y la fuente de la app los cambia el administrador.</p>
      )}
    </>
  )
}

// RA-06 a RA-09: cada usuario elige el suyo; se ve al instante y queda en su perfil.
function ModoPantalla({ oscuro }: { oscuro: boolean | null }) {
  const [eleccion, setEleccion] = useState(oscuro)
  const [delEquipo, setDelEquipo] = useState(false)
  const [aviso, setAviso] = useState<Resultado>({})
  const [, iniciar] = useTransition()

  useEffect(() => {
    const mm = matchMedia('(prefers-color-scheme: dark)')
    const ver = () => setDelEquipo(mm.matches)
    ver()
    mm.addEventListener('change', ver)
    // El atajo del panel lateral cambia data-modo: se refleja aquí.
    const obs = new MutationObserver(() => {
      const m = document.documentElement.dataset.modo
      setEleccion(m ? m === 'oscuro' : null)
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-modo'] })
    return () => {
      mm.removeEventListener('change', ver)
      obs.disconnect()
    }
  }, [])

  const activo = eleccion ?? delEquipo
  const cambiar = (nuevo: boolean | null) => {
    setEleccion(nuevo)
    if (nuevo === null) delete document.documentElement.dataset.modo
    else document.documentElement.dataset.modo = nuevo ? 'oscuro' : 'claro'
    iniciar(async () => setAviso(await guardarModoOscuro(nuevo)))
  }

  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>Modo de pantalla</h2>
          <small>Lo elige cada usuario. No cambia la pantalla de los demás asesores.</small>
        </div>
      </div>
      <div className="panel-b apariencia-fila">
        <label className="check" htmlFor="modo-oscuro">
          <input id="modo-oscuro" type="checkbox" role="switch" className="switch" checked={activo}
            onChange={(e) => cambiar(e.target.checked)} />
          <span>
            Modo oscuro <b className="apariencia-si">{activo ? 'Sí' : 'No'}</b>
            <small>
              {eleccion === null
                ? `Sigue al equipo (ahora ${delEquipo ? 'oscuro' : 'claro'}) hasta que lo cambies.`
                : 'Tu elección se guarda y se usa en cualquier equipo donde entres.'}
            </small>
          </span>
        </label>
        {eleccion !== null && (
          <button type="button" className="btn chico" onClick={() => cambiar(null)}>
            Seguir al equipo
          </button>
        )}
        {aviso.error && <span className="aviso bad">{aviso.error}</span>}
      </div>
    </section>
  )
}

// RA-01 a RA-05, RA-10 a RA-16: logo, colores y fuente de toda la app, con vista previa hasta guardar.
function Marca({ apariencia }: { apariencia: Apariencia }) {
  const guardado = useMemo(() => desdeBase(apariencia), [apariencia])
  const [elegido, setElegido] = useState<Elegido>(guardado)
  const [hex, setHex] = useState<Record<keyof Colores, string>>(guardado)
  const [logoNuevo, setLogoNuevo] = useState<string | null>(null)
  const [estado, accion] = useFormState<Resultado, FormData>(guardarApariencia, {})
  const [avisoLogo, setAvisoLogo] = useState<Resultado>({})
  const [quitando, iniciarQuitar] = useTransition()
  const archivo = useRef<HTMLInputElement>(null)

  // Lo guardado manda después de guardar (o si otro administrador cambió algo).
  useEffect(() => {
    setElegido(guardado)
    setHex(guardado)
    setLogoNuevo(null)
    if (archivo.current) archivo.current.value = ''
  }, [guardado])

  // RA-02: la app se ve con lo elegido mientras se elige; nada queda hasta Guardar.
  const sucio = logoNuevo !== null || (Object.keys(guardado) as (keyof Elegido)[]).some((k) => guardado[k] !== elegido[k])
  useEffect(() => {
    let previa = document.getElementById('apariencia-previa')
    if (!sucio) {
      previa?.remove()
      return
    }
    if (!previa) {
      previa = document.createElement('style')
      previa.id = 'apariencia-previa'
      document.body.appendChild(previa)
    }
    // La fuente va siempre: si lo guardado es otra, la de la marca también tiene que verse.
    previa.textContent =
      cssApariencia(elegido).replaceAll('html:root', 'html:root:root') + `html:root:root{--fuente-app:var(--fuente-${elegido.fuente})}`
  }, [elegido, sucio])
  useEffect(() => () => document.getElementById('apariencia-previa')?.remove(), [])

  useEffect(() => () => {
    if (logoNuevo) URL.revokeObjectURL(logoNuevo)
  }, [logoNuevo])

  const avisos = avisosContraste(elegido)
  const tema = TEMAS.find((t) => (['panel', 'principal', 'acento'] as const).every((k) => t.colores[k] === elegido[k]))
  const ponerColor = (k: keyof Colores, v: string) => {
    setHex((h) => ({ ...h, [k]: v }))
    if (esColor(v)) setElegido((e) => ({ ...e, [k]: v.toUpperCase() }))
  }
  const ponerTema = (c: Record<keyof Colores, string>) => {
    setElegido((e) => ({ ...e, ...c }))
    setHex((h) => ({ ...h, ...c }))
  }
  const cancelar = () => {
    setElegido(guardado)
    setHex(guardado)
    setLogoNuevo(null)
    if (archivo.current) archivo.current.value = ''
  }
  const logoVisible = logoNuevo ?? urlLogo(apariencia.logo)

  return (
    <form action={accion} className="panel">
      <div className="panel-h">
        <div>
          <h2>Marca de la app</h2>
          <small>Logo, colores y fuente para todos. Mientras eliges, la ves con ellos. Nada queda hasta guardar.</small>
        </div>
        {tema && <span className="chip acc">{tema.nombre}</span>}
      </div>

      <div className="apariencia-bloque">
        <h3 className="sub">Logo</h3>
        <div className="apariencia-logo">
          <div className="apariencia-logo-caja" style={{ background: elegido.panel }}>
            {logoVisible ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local o el logo de la app
              <img src={logoVisible} alt="Logo actual" />
            ) : (
              <span className="logo" aria-label="Logo «VV» de la marca">VV</span>
            )}
          </div>
          <div className="apariencia-logo-txt">
            <small className="muted">PNG, JPG o WebP de hasta 1 MB. Mejor cuadrado y con fondo transparente. Se ve en el panel, el login y la pestaña del navegador.</small>
            <div className="row">
              <label className="btn chico" htmlFor="logo">
                {apariencia.logo || logoNuevo ? 'Cambiar logo' : 'Subir logo'}
              </label>
              <input id="logo" ref={archivo} name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="apariencia-archivo"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  setLogoNuevo(f ? URL.createObjectURL(f) : null)
                }} />
              {logoNuevo && <button type="button" className="btn chico" onClick={() => { setLogoNuevo(null); if (archivo.current) archivo.current.value = '' }}>Descartar</button>}
              {apariencia.logo && !logoNuevo && (
                <button type="button" className="btn chico peligro" disabled={quitando}
                  onClick={() => iniciarQuitar(async () => setAvisoLogo(await quitarLogo()))}>
                  Quitar logo
                </button>
              )}
            </div>
            {avisoLogo.error && <span className="aviso bad">{avisoLogo.error}</span>}
            {avisoLogo.ok && <span className="aviso ok">{avisoLogo.ok}</span>}
          </div>
        </div>
      </div>

      <div className="apariencia-bloque">
        <h3 className="sub">Colores</h3>
        <div className="row" role="group" aria-label="Paletas listas">
          {TEMAS.map((t) => (
            <button key={t.clave} type="button" className={`pastilla${tema?.clave === t.clave ? ' activa' : ''}`}
              aria-pressed={tema?.clave === t.clave} onClick={() => ponerTema(t.colores)}>
              <span className="apariencia-puntos" aria-hidden="true">
                <i style={{ background: t.colores.panel }} /><i style={{ background: t.colores.principal }} /><i style={{ background: t.colores.acento }} />
              </span>
              {t.nombre}
            </button>
          ))}
        </div>
        <div className="apariencia-colores">
          {CAMPOS.map(([k, titulo, ayuda]) => (
            <div key={k}>
              <div className="apariencia-color">
                <input type="color" aria-label={`${titulo}: elegir color`} value={elegido[k].toLowerCase()}
                  onChange={(e) => ponerColor(k, e.target.value.toUpperCase())} />
                <span className="apariencia-color-txt">
                  <b>{titulo}</b>
                  <small className="muted">{ayuda}</small>
                </span>
                <input name={k} className="apariencia-hex mono" maxLength={7} spellCheck={false} aria-label={`${titulo}: código`}
                  aria-invalid={!esColor(hex[k])} value={hex[k]} onChange={(e) => ponerColor(k, e.target.value.trim())} />
              </div>
              {avisos[k] && <p className="aviso apariencia-aviso">{avisos[k]}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="apariencia-bloque">
        <h3 className="sub">Fuente</h3>
        <small className="muted">Los precios y los códigos siguen en letra de ancho fijo para que alineen.</small>
        <div className="apariencia-fuentes" role="radiogroup" aria-label="Fuente">
          {FUENTES.map((f) => (
            <label key={f.valor} className={`apariencia-fuente${elegido.fuente === f.valor ? ' elegida' : ''}`}>
              <input type="radio" name="fuente" value={f.valor} checked={elegido.fuente === f.valor}
                onChange={() => setElegido((e) => ({ ...e, fuente: f.valor }))} />
              <span className="apariencia-fuente-n" style={{ fontFamily: `var(--fuente-${f.valor})` }}>
                {f.nombre}
                {f.valor === FUENTE_MARCA && <span className="chip acc">Recomendada</span>}
              </span>
              <small className="muted">{f.ayuda}</small>
            </label>
          ))}
        </div>
      </div>

      <div className="apariencia-acciones">
        <BotonGuardar sucio={sucio} />
        <button type="button" className="btn" disabled={!sucio} onClick={cancelar}>Cancelar</button>
        <button type="button" className="btn" onClick={() => ponerTema(MARCA)}>Restaurar colores de la marca</button>
        {sucio && <span className="apariencia-sucio">Cambios sin guardar</span>}
        {!sucio && estado.ok && <span className="aviso ok">{estado.ok}</span>}
        {estado.error && <span className="aviso bad">{estado.error}</span>}
      </div>
    </form>
  )
}
