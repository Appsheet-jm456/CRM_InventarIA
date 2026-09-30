import Link from 'next/link'
import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { Horario } from './Horario'
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
      const { data: nodos } = await supabase
        .from('bot_nodos')
        .select('clave, nombre, texto, opciones, texto_original, opciones_original, max_titulo, marcas, actualizado_en')
        .order('orden')
      return <Mensajes nodos={nodos ?? []} actual={searchParams.n} />
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
