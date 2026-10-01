import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { contexto, cuadrosDe } from '../../datos'
import { Historial, type VersionFila } from '../../Historial'
import { Lienzo } from '../../Lienzo'

// El lienzo de un bot y su historial de versiones (F4·9, decisión 0028). Ocupa todo el ancho de la pantalla.
export default async function BotFlujo({ params, searchParams }: { params: { id: string }; searchParams: { t?: string; v?: string } }) {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_bot'])) return <SinPermiso />
  const id = Number(params.id)
  if (!Number.isInteger(id) || id < 1) notFound()

  const supabase = crearCliente()
  const { data: bot } = await supabase.from('bots').select('id, nombre, principal, archivado').eq('id', id).maybeSingle()
  if (!bot) notFound()
  const { data: abierto } = await supabase.from('bot_flujos').select('version').eq('estado', 'borrador').eq('bot_id', id).maybeSingle()
  const historial = searchParams.t === 'historial'
  let contenido: React.ReactNode

  if (historial) {
    const [{ data: versiones }, { data: usuarios }] = await Promise.all([
      supabase.from('bot_flujos').select('version, estado, nota, creado_por, creado_en, publicado_por, publicado_en, bot_cuadros(count)')
        .eq('bot_id', id).order('version', { ascending: false }),
      supabase.from('usuarios').select('id, nombre'),
    ])
    const nombres = new Map((usuarios ?? []).map((u) => [u.id, u.nombre]))
    const filas: VersionFila[] = (versiones ?? []).map((v) => ({
      version: v.version, estado: v.estado, nota: v.nota, creado_en: v.creado_en, publicado_en: v.publicado_en,
      creado_por: nombres.get(v.creado_por) ?? null, publicado_por: nombres.get(v.publicado_por) ?? null,
      cuadros: (v.bot_cuadros as unknown as { count: number }[])[0]?.count ?? 0,
    }))
    contenido = <Historial bot={id} versiones={filas} hayBorrador={!!abierto} archivado={bot.archivado} />
  } else {
    const { ctx, opcionesMarca } = await contexto(supabase)
    const publicada = await cuadrosDe(supabase, id, 'publicada', opcionesMarca)
    const otra = Number(searchParams.v)
    if (otra && otra !== abierto?.version) {
      // Una versión del historial (o la publicada con un borrador abierto), solo para ver.
      const vista = await cuadrosDe(supabase, id, otra, opcionesMarca)
      contenido = <Lienzo bot={bot} publicada={publicada} borrador={null} archivada={vista.version ? vista : undefined} contexto={ctx} hayBorrador={!!abierto} />
    } else {
      const borrador = await cuadrosDe(supabase, id, 'borrador', opcionesMarca)
      const { data: choques } = borrador.version ? await supabase.rpc('cambios_publicados_despues', { p_bot: id }) : { data: [] }
      contenido = <Lienzo bot={bot} publicada={publicada} borrador={borrador.version ? borrador : null} contexto={ctx}
        choques={(choques ?? []) as { clave: string; nombre: string }[]} hayBorrador={!!abierto} />
    }
  }

  return (
    <div className="bot-pagina">
      <div className="bot-cabecera">
        <Link href="/bot?t=bots" className="btn chico">← Bots</Link>
        <h1>{bot.principal ? '⭐ ' : ''}{bot.nombre}</h1>
        {bot.principal && <span className="chip ok">Principal</span>}
        {bot.archivado && <span className="chip neu">Archivado</span>}
        <div className="embudos-tabs" style={{ marginLeft: 'auto', marginBottom: 0 }}>
          <Link href={`/bot/flujo/${id}`} className={`pastilla${!historial ? ' activa' : ''}`}>Lienzo</Link>
          <Link href={`/bot/flujo/${id}?t=historial`} className={`pastilla${historial ? ' activa' : ''}`}>Historial de versiones</Link>
        </div>
      </div>
      {contenido}
    </div>
  )
}
