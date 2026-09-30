import Link from 'next/link'
import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { Horario } from './Horario'
import { textoHorario } from '@/lib/bot'
import { pesos } from '@/lib/inventario'
import { Mensajes } from './Mensajes'

export default async function Bot({ searchParams }: { searchParams: { t?: string; n?: string } }) {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_bot'])) return <SinPermiso />

  const supabase = crearCliente()
  const horario = searchParams.t === 'horario'
  const contenido = horario ? (
    await (async () => {
      const [{ data: franjas }, { data: festivos }] = await Promise.all([
        supabase.from('horario_atencion').select('id, dia, abre, cierra').order('dia').order('abre'),
        supabase.from('festivos').select('fecha, nombre').order('fecha'),
      ])
      return <Horario franjas={(franjas ?? []).map((f) => ({ ...f, abre: f.abre.slice(0, 5), cierra: f.cierra.slice(0, 5) }))} festivos={festivos ?? []} />
    })()
  ) : (
    await (async () => {
      const [{ data: nodos }, { data: franjas }, { data: equipos }] = await Promise.all([
        supabase.from('bot_nodos')
          .select('clave, nombre, texto, opciones, texto_original, opciones_original, max_titulo, marcas, formato, opciones_codigo, actualizado_en')
          .order('orden'),
        supabase.from('horario_atencion').select('dia, abre, cierra'),
        supabase.from('productos').select('codigo, marca, modelo, procesador, ram, almacenamiento, estado, precio').gt('stock', 0).order('precio'),
      ])
      // B001A4: las marcas con stock de verdad, como las arma flujo.b001a4.
      const marcas = [...new Set((equipos ?? []).map((p) => p.marca).filter(Boolean))].sort()
        .map((m, i) => ({ id: String(i + 1), titulo: m.toLowerCase().replace(/(^|\s)\S/g, (c: string) => c.toUpperCase()) }))
      const lista = (nodos ?? []).map((n) => n.clave === 'B001A4' && marcas.length
        ? { ...n, opciones_codigo: [...marcas, { id: String(marcas.length + 1), titulo: 'Todas las marcas' }] } : n)
      // La ficha de flujo.r11 con el primer equipo con stock.
      const p = equipos?.[0]
      const ficha = p
        ? `💻 *${p.marca} ${p.modelo}* · Código ${p.codigo}\n${p.procesador} · ${p.ram} · ${p.almacenamiento}${p.estado ? ` · ${p.estado}` : ''}\n💰 ${pesos(p.precio).replace(/\s/g, '')} · ✅ Disponible`
        : '💻 *DELL LATITUDE 5420* · Código 100-102-1041\nCore i5-1145G7 · 16GB · 256GB NVMe · Usado\n💰 $1.450.000 · ✅ Disponible'
      return <Mensajes nodos={lista} actual={searchParams.n} contexto={{ horario: textoHorario(franjas ?? []), ficha }} />
    })()
  )

  return (
    <>
      <div className="embudos-tabs">
        <Link href="/bot" className={`pastilla${horario ? '' : ' activa'}`}>Mensajes del bot</Link>
        <Link href="/bot?t=horario" className={`pastilla${horario ? ' activa' : ''}`}>Horario y festivos</Link>
      </div>
      {contenido}
    </>
  )
}
