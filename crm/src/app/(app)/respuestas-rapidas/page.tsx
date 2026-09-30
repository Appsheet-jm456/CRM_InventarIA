import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { ListaRespuestas } from './ListaRespuestas'

export default async function RespuestasRapidas() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_bot'])) return <SinPermiso />
  const { data } = await crearCliente().from('respuestas_rapidas').select('id, atajo, titulo, texto, activo').order('atajo')
  return <ListaRespuestas respuestas={data ?? []} />
}
