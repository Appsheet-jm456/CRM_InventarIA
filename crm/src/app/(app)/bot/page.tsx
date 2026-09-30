import Link from 'next/link'
import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { textoHorario } from '@/lib/bot'
import { pesos } from '@/lib/inventario'
import { Horario } from './Horario'
import { Lienzo, type Cuadro } from './Lienzo'
import { Mensajes, type Contexto } from './Mensajes'

const COLUMNAS = 'clave, tipo, nombre, orden, inicio, texto, opciones, texto_original, opciones_original, opciones_codigo, max_titulo, marcas, formato, salidas, x, y, actualizado_en'

type Supabase = ReturnType<typeof crearCliente>

// El horario real, la ficha de un equipo con stock y las marcas con stock: la vista previa muestra lo que ve el cliente.
async function contexto(supabase: Supabase) {
  const [{ data: franjas }, { data: equipos }] = await Promise.all([
    supabase.from('horario_atencion').select('dia, abre, cierra'),
    supabase.from('productos').select('codigo, marca, modelo, procesador, ram, almacenamiento, estado, precio').gt('stock', 0).order('precio'),
  ])
  const p = equipos?.[0]
  // La ficha de flujo.r11 con el primer equipo con stock.
  const ficha = p
    ? `💻 *${p.marca} ${p.modelo}* · Código ${p.codigo}\n${p.procesador} · ${p.ram} · ${p.almacenamiento}${p.estado ? ` · ${p.estado}` : ''}\n💰 ${pesos(p.precio).replace(/\s/g, '')} · ✅ Disponible`
    : '💻 *DELL LATITUDE 5420* · Código 100-102-1041\nCore i5-1145G7 · 16GB · 256GB NVMe · Usado\n💰 $1.450.000 · ✅ Disponible'
  // Las marcas con stock, como las arma flujo.mostrar_marca.
  const marcas = [...new Set((equipos ?? []).map((e) => e.marca).filter(Boolean))].sort()
    .map((m, i) => ({ id: String(i + 1), titulo: m.toLowerCase().replace(/(^|\s)\S/g, (c: string) => c.toUpperCase()) }))
  const opcionesMarca = marcas.length ? [...marcas, { id: String(marcas.length + 1), titulo: 'Todas las marcas' }] : null
  const ctx: Contexto = { horario: textoHorario(franjas ?? []), ficha }
  return { ctx, opcionesMarca }
}

// Cuadros de la versión publicada o del borrador (decisión 0026).
async function cuadrosDe(supabase: Supabase, estado: 'publicada' | 'borrador', opcionesMarca: Cuadro['opciones_codigo']) {
  const { data } = await supabase.from('bot_cuadros').select(`${COLUMNAS}, bot_flujos!inner(version, estado)`)
    .eq('bot_flujos.estado', estado).order('orden')
  const version = (data?.[0]?.bot_flujos as unknown as { version: number } | undefined)?.version
  const cuadros = ((data ?? []) as unknown as Cuadro[])
    .map((c) => (c.tipo === 'marca' && opcionesMarca ? { ...c, opciones_codigo: opcionesMarca } : c))
  return { cuadros, version }
}

export default async function Bot({ searchParams }: { searchParams: { t?: string; n?: string } }) {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_bot'])) return <SinPermiso />

  const supabase = crearCliente()
  const pestana = searchParams.t === 'horario' ? 'horario' : searchParams.t === 'flujo' ? 'flujo' : 'mensajes'
  let contenido: React.ReactNode

  if (pestana === 'horario') {
    const [{ data: franjas }, { data: festivos }] = await Promise.all([
      supabase.from('horario_atencion').select('id, dia, abre, cierra').order('dia').order('abre'),
      supabase.from('festivos').select('fecha, nombre').order('fecha'),
    ])
    contenido = <Horario franjas={(franjas ?? []).map((f) => ({ ...f, abre: f.abre.slice(0, 5), cierra: f.cierra.slice(0, 5) }))} festivos={festivos ?? []} />
  } else {
    const { ctx, opcionesMarca } = await contexto(supabase)
    const publicada = await cuadrosDe(supabase, 'publicada', opcionesMarca)
    if (pestana === 'flujo') {
      const borrador = await cuadrosDe(supabase, 'borrador', opcionesMarca)
      contenido = <Lienzo publicada={publicada} borrador={borrador.version ? borrador : null} contexto={ctx} />
    } else {
      contenido = <Mensajes nodos={publicada.cuadros.filter((c) => c.formato !== 'sistema')} version={publicada.version}
        actual={searchParams.n} contexto={ctx} />
    }
  }

  return (
    <>
      <div className="embudos-tabs">
        <Link href="/bot" className={`pastilla${pestana === 'mensajes' ? ' activa' : ''}`}>Mensajes del bot</Link>
        <Link href="/bot?t=flujo" className={`pastilla${pestana === 'flujo' ? ' activa' : ''}`}>Flujo (lienzo)</Link>
        <Link href="/bot?t=horario" className={`pastilla${pestana === 'horario' ? ' activa' : ''}`}>Horario y festivos</Link>
      </div>
      {contenido}
    </>
  )
}
