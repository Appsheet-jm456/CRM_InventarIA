// Apariencia de la app (F4·19, decisión 0031): logo, tres colores y fuente que elige el administrador; el modo
// oscuro lo elige cada usuario. Sin dependencias del servidor: la usan la pantalla de Apariencia (vista previa),
// el Shell y el layout. Copia adaptada de lib/marca.ts de Futur Green (allá decisión 0027).

export type Colores = { panel: string | null; principal: string | null; acento: string | null }
export type Fuente = 'figtree' | 'nunito' | 'atkinson'
export type Apariencia = Colores & { fuente: Fuente | null; logo: string | null }

// Null en la base = estos (la paleta de globals.css). Azul Ventas Virtuales.
export const MARCA = { panel: '#0F1E33', principal: '#2563C9', acento: '#F2A23A' } as const
export const FUENTE_MARCA: Fuente = 'figtree'

export const TEMAS: { clave: string; nombre: string; colores: Record<keyof typeof MARCA, string> }[] = [
  { clave: 'marca', nombre: 'Azul Ventas Virtuales', colores: MARCA },
  { clave: 'grafito', nombre: 'Grafito', colores: { panel: '#1D2026', principal: '#3D5A80', acento: '#E2703A' } },
  { clave: 'petroleo', nombre: 'Petróleo', colores: { panel: '#0D2B33', principal: '#0E7C86', acento: '#F4C04E' } },
  { clave: 'anterior', nombre: 'Anterior (verde)', colores: { panel: '#14352D', principal: '#2E8C6A', acento: '#2E8C6A' } },
]

export const FUENTES: { valor: Fuente; nombre: string; ayuda: string }[] = [
  { valor: 'figtree', nombre: 'Figtree', ayuda: 'Redonda y clara en tamaños pequeños' },
  { valor: 'nunito', nombre: 'Nunito Sans', ayuda: 'Suave, letras anchas' },
  { valor: 'atkinson', nombre: 'Atkinson Hyperlegible', ayuda: 'Máxima legibilidad: 1 l I · 0 O' },
]
export const esFuente = (v: unknown): v is Fuente => v === 'figtree' || v === 'nunito' || v === 'atkinson'

// La variable CSS de cada fuente la pone next/font en <html> (layout.tsx).
export const VARIABLE_FUENTE: Record<Fuente, string> = {
  figtree: 'var(--fuente-figtree)',
  nunito: 'var(--fuente-nunito)',
  atkinson: 'var(--fuente-atkinson)',
}

// El logo subido lo sirve /marca/<ruta> (route handler); sin logo se ve el monograma «VV».
export const urlLogo = (logo: string | null) => (logo ? `/marca/${logo}` : null)

export const esColor = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v)

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

export function mezclar(a: string, b: string, p: number) {
  const [x, y] = [rgb(a), rgb(b)]
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * p).toString(16).padStart(2, '0')).join('').toUpperCase()
}

// Contraste WCAG entre dos colores (1 a 21).
export function contraste(a: string, b: string) {
  const lum = (h: string) => {
    const [r, g, bl] = rgb(h).map((v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

// RA-04: avisa (no bloquea) si el texto blanco de los botones o los nombres del panel no se leen.
// El acento es decorativo y no lleva texto encima.
export function avisosContraste(c: Colores): Partial<Record<keyof Colores, string>> {
  const avisos: Partial<Record<keyof Colores, string>> = {}
  const formato = (n: number) => n.toFixed(1).replace('.', ',')
  if (c.principal && esColor(c.principal)) {
    const n = contraste(c.principal, '#FFFFFF')
    if (n < 4.5) avisos.principal = `El texto blanco de los botones se leería con dificultad (contraste ${formato(n)}:1; se pide 4,5:1). Prueba un tono más oscuro.`
  }
  if (c.panel && esColor(c.panel)) {
    const n = contraste(c.panel, '#DCE4EF')
    if (n < 4.5) avisos.panel = `Los nombres de los módulos se leerían con dificultad (contraste ${formato(n)}:1; se pide 4,5:1). Prueba un tono más oscuro.`
  }
  return avisos
}

// Variables CSS que cambian con cada color elegido, en claro y en oscuro. Solo las de los colores que el
// administrador cambió: los demás quedan como en globals.css.
export function variablesApariencia(a: Colores & { fuente?: Fuente | null }) {
  const claro: Record<string, string> = {}
  const oscuro: Record<string, string> = {}
  if (a.panel) {
    claro['--side'] = a.panel
    claro['--side-hover'] = mezclar(a.panel, '#FFFFFF', 0.1)
    oscuro['--side'] = mezclar(a.panel, '#000000', 0.35)
    oscuro['--side-hover'] = mezclar(oscuro['--side'], '#FFFFFF', 0.07)
  }
  if (a.principal) {
    claro['--accent'] = claro['--side-active'] = oscuro['--side-active'] = a.principal
    claro['--accent-soft'] = mezclar(a.principal, '#FFFFFF', 0.88)
    oscuro['--accent'] = mezclar(a.principal, '#FFFFFF', 0.35)
    oscuro['--accent-soft'] = mezclar(a.principal, '#151D28', 0.78)
  }
  if (a.acento) {
    claro['--brand'] = a.acento
    claro['--brand-soft'] = mezclar(a.acento, '#FFFFFF', 0.85)
    oscuro['--brand'] = mezclar(a.acento, '#FFFFFF', 0.12)
    oscuro['--brand-soft'] = mezclar(a.acento, '#151D28', 0.8)
  }
  if (a.fuente && a.fuente !== FUENTE_MARCA) claro['--fuente-app'] = VARIABLE_FUENTE[a.fuente]
  return { claro, oscuro }
}

// html:root le gana a :root de globals.css sin importar el orden de las hojas. Los tonos oscuros siguen la
// misma regla del modo que globals.css: data-modo del usuario y, si no eligió, el del equipo.
export function cssApariencia(a: Colores & { fuente?: Fuente | null }) {
  const { claro, oscuro } = variablesApariencia(a)
  const decl = (v: Record<string, string>) => Object.entries(v).map(([k, x]) => `${k}:${x}`).join(';')
  if (!Object.keys(claro).length) return ''
  const o = decl(oscuro)
  return (
    `html:root{${decl(claro)}}` +
    (o ? `html:root[data-modo="oscuro"]{${o}}@media (prefers-color-scheme: dark){html:root:not([data-modo="claro"]){${o}}}` : '')
  )
}

// Modo de pantalla del usuario: null = sigue al equipo (RA-07).
export type Modo = 'claro' | 'oscuro' | null
export const modoDe = (oscuro: boolean | null): Modo => (oscuro === null ? null : oscuro ? 'oscuro' : 'claro')
