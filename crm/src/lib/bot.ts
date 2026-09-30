// Cómo sale cada mensaje del bot (F4·4). Espejo de flujo.py y de bot_medir (migración 0010): si cambia uno,
// cambian los tres. La base es la que decide al guardar; esto es para ver y contar mientras se escribe.

export type Opcion = { id: string; titulo: string; descripcion?: string }
export type Formato = 'menu' | 'texto' | 'ficha' | 'motivo'
export type Medida = { largo: number; limite: number; forma: 'botones' | 'lista' | 'texto' }

// El valor más largo de cada marca (bot_largo_marca).
export const LARGO_MARCA: Record<string, number> = { uso: 9, motivo: 204, horario: 400, proxima: 40 }

// Largo en caracteres como los cuenta Python (y PostgreSQL): por punto de código, no por unidad UTF-16.
export const largo = (s: string) => [...s].length

export const numerada = (o: Opcion) => `${o.id}️⃣ ${o.titulo}`

export function esBotones(opciones: Opcion[]) {
  return opciones.length <= 3 && opciones.every((o) => largo(o.titulo) <= 20)
}

export function medir(texto: string, formato: Formato, opciones: Opcion[], marcas: string[]): Medida {
  let n = largo(texto)
  for (const m of marcas) n += (texto.split(`{${m}}`).length - 1) * ((LARGO_MARCA[m] ?? 0) - m.length - 2)
  if (formato === 'motivo') return { largo: n, limite: 200, forma: 'texto' }
  if (formato !== 'menu') return { largo: n, limite: 4096, forma: 'texto' }
  if (opciones.length) n += 2 + opciones.reduce((s, o) => s + largo(numerada(o)), 0) + opciones.length - 1
  else n += 2
  const botones = esBotones(opciones)
  return { largo: n, limite: botones ? 1024 : 4096, forma: botones ? 'botones' : 'lista' }
}

// Marcas {x} que el bot no reemplaza (la base no deja guardarlas) y las del mensaje que se quitaron.
export function revisarMarcas(texto: string, marcas: string[]) {
  const usadas = [...texto.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1])
  return {
    desconocidas: [...new Set(usadas.filter((m) => !marcas.includes(m)))],
    faltantes: marcas.filter((m) => !usadas.includes(m)),
  }
}

// flujo.texto_horario: une los días seguidos con las mismas franjas.
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const hora = (t: string) => {
  const h = Number(t.slice(0, 2))
  const m = t.slice(3, 5)
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`
}

export function textoHorario(franjas: { dia: number; abre: string; cierra: string }[]) {
  const porDia = new Map<number, string[]>()
  for (const f of [...franjas].sort((a, b) => a.abre.localeCompare(b.abre)))
    porDia.set(f.dia, [...(porDia.get(f.dia) ?? []), `${hora(f.abre)} – ${hora(f.cierra)}`])
  if (!porDia.size) return 'Horario por confirmar.'
  const grupos: [string[], number[]][] = []
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const fr = porDia.get(d)
    if (!fr) continue
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo[0].join() === fr.join() && ultimo[1][ultimo[1].length - 1] === (d + 6) % 7) ultimo[1].push(d)
    else grupos.push([fr, [d]])
  }
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
  return grupos.map(([fr, dias]) => {
    const nombre = dias.length > 1 ? `${cap(DIAS[dias[0]])} a ${DIAS[dias[dias.length - 1]]}` : dias[0] === 6 ? 'Sábados' : `${cap(DIAS[dias[0]])}s`
    return `🕗 ${nombre}: ${fr.join(' y ')}`
  }).join('\n') + '\nFestivos: cerrado.'
}
