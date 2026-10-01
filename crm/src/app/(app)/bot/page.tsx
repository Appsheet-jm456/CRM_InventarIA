import Link from 'next/link'
import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { Bots, type BotFila } from './Bots'
import { botsDe, contexto, cuadrosDe } from './datos'
import { Horario } from './Horario'
import { Mensajes } from './Mensajes'

export default async function Bot({ searchParams }: { searchParams: { t?: string; n?: string; b?: string } }) {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_bot'])) return <SinPermiso />

  const supabase = crearCliente()
  // 'flujo' e 'historial' eran pestañas de un solo flujo (F4·6 y F4·7): ahora cada bot tiene su lienzo y su historial.
  const pestana = (['horario', 'bots'] as const).find((t) => t === searchParams.t)
    ?? (searchParams.t === 'flujo' || searchParams.t === 'historial' ? 'bots' : 'mensajes')
  let contenido: React.ReactNode

  if (pestana === 'bots') {
    const [bots, { data: flujos }, { data: usuarios }] = await Promise.all([
      botsDe(supabase),
      supabase.from('bot_flujos').select('bot_id, version, estado, creado_por, creado_en, publicado_por, publicado_en, bot_cuadros(count)'),
      supabase.from('usuarios').select('id, nombre'),
    ])
    const nombres = new Map((usuarios ?? []).map((u) => [u.id, u.nombre]))
    const filas: BotFila[] = bots.map((b) => {
      const pub = flujos?.find((f) => f.bot_id === b.id && f.estado === 'publicada')
      const bor = flujos?.find((f) => f.bot_id === b.id && f.estado === 'borrador')
      const cuenta = (f?: { bot_cuadros: unknown }) => (f?.bot_cuadros as { count: number }[] | undefined)?.[0]?.count ?? 0
      // Lo último que pasó: abrir el borrador o publicar.
      const borradorEsReciente = bor && (!pub?.publicado_en || bor.creado_en > pub.publicado_en)
      return {
        id: b.id, nombre: b.nombre, principal: b.principal, archivado: b.archivado,
        publicada: pub?.version ?? null, borrador: bor?.version ?? null, cuadros: cuenta(pub ?? bor),
        cambio: borradorEsReciente ? bor!.creado_en : pub?.publicado_en ?? b.creado_en,
        por: nombres.get((borradorEsReciente ? bor!.creado_por : pub?.publicado_por) ?? '') ?? null,
      }
    })
    contenido = <Bots bots={filas} />
  } else if (pestana === 'horario') {
    const [{ data: franjas }, { data: festivos }] = await Promise.all([
      supabase.from('horario_atencion').select('id, dia, abre, cierra').order('dia').order('abre'),
      supabase.from('festivos').select('fecha, nombre').order('fecha'),
    ])
    contenido = <Horario franjas={(franjas ?? []).map((f) => ({ ...f, abre: f.abre.slice(0, 5), cierra: f.cierra.slice(0, 5) }))} festivos={festivos ?? []} />
  } else {
    // Mensajes: los textos de la versión publicada de un bot (el principal si no se elige otro).
    const todos = await botsDe(supabase)
    const { data: publicados } = await supabase.from('bot_flujos').select('bot_id').eq('estado', 'publicada')
    const conPublicada = todos.filter((b) => !b.archivado && publicados?.some((f) => f.bot_id === b.id))
    const bot = conPublicada.find((b) => b.id === Number(searchParams.b)) ?? conPublicada.find((b) => b.principal) ?? conPublicada[0]
    if (!bot) {
      contenido = <section className="panel"><div className="panel-b"><div className="aviso warn">Ningún bot está publicado todavía.</div></div></section>
    } else {
      const { ctx, opcionesMarca } = await contexto(supabase)
      const publicada = await cuadrosDe(supabase, bot.id, 'publicada', opcionesMarca)
      const { data: abierto } = await supabase.from('bot_flujos').select('version').eq('estado', 'borrador').eq('bot_id', bot.id).maybeSingle()
      contenido = (
        <>
          {abierto && (
            <div className="aviso warn">
              Hay un borrador del flujo de «{bot.nombre}» abierto (versión {abierto.version}). Lo que cambies aquí va a la versión publicada;
              al publicar el borrador se te avisará si lo pisa. <Link href={`/bot/flujo/${bot.id}`}>Ir al borrador</Link>
            </div>
          )}
          <Mensajes nodos={publicada.cuadros.filter((c) => c.formato !== 'sistema')} version={publicada.version}
            actual={searchParams.n} contexto={ctx} bot={bot.id} bots={conPublicada} />
        </>
      )
    }
  }

  return (
    <>
      <div className="embudos-tabs">
        <Link href="/bot" className={`pastilla${pestana === 'mensajes' ? ' activa' : ''}`}>Mensajes del bot</Link>
        <Link href="/bot?t=bots" className={`pastilla${pestana === 'bots' ? ' activa' : ''}`}>Flujos (lienzo)</Link>
        <Link href="/bot?t=horario" className={`pastilla${pestana === 'horario' ? ' activa' : ''}`}>Horario y festivos</Link>
      </div>
      {contenido}
    </>
  )
}
