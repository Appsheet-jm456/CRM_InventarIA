'use server'

import { revalidatePath } from 'next/cache'
import { crearPlantilla } from '@/lib/meta'
import { PLANTILLAS_CRM } from '@/lib/plantillasCrm'
import { obtenerSesion, puede } from '@/lib/sesion'

// Envía a aprobación de Meta una plantilla propuesta por el CRM (0021). Solo con administrar_canal.
export async function enviarAAprobacion(nombre: string): Promise<{ error?: string; ok?: string }> {
  const sesion = await obtenerSesion()
  if (!sesion || !puede(sesion, ['administrar_canal'])) return { error: 'No tienes permiso para crear plantillas.' }
  const p = PLANTILLAS_CRM.find((x) => x.nombre === nombre)
  if (!p) return { error: 'Esa plantilla no está entre las propuestas.' }
  const r = await crearPlantilla(p.nombre, p.categoria, p.cuerpo, [...p.ejemplos])
  if (r.error) return { error: r.error }
  revalidatePath('/canal')
  return { ok: `${p.nombre} enviada a Meta (estado: ${r.estado}).` }
}
