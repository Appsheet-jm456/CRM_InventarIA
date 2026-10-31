import 'server-only'
import { cache } from 'react'
import { esFuente, type Apariencia } from '@/lib/marca'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearCliente } from '@/lib/supabase/server'

const VACIA: Apariencia = { panel: null, principal: null, acento: null, fuente: null, logo: null }

// El login también lleva el logo y los colores, y ahí no hay sesión: se leen con la llave de servicio, solo
// estas columnas (decisión 0031, RA-15). anon sigue sin ver nada en la base.
export const leerApariencia = cache(async (): Promise<Apariencia> => {
  const { data } = await crearClienteAdmin()
    .from('apariencia')
    .select('color_panel, color_principal, color_acento, fuente, logo')
    .eq('id', 1)
    .single()
  if (!data) return VACIA
  return {
    panel: data.color_panel,
    principal: data.color_principal,
    acento: data.color_acento,
    fuente: esFuente(data.fuente) ? data.fuente : null,
    logo: data.logo,
  }
})

// Modo oscuro del usuario con sesión (RA-06): true, false o null (sigue al equipo). Sin sesión, null.
export const leerModoOscuro = cache(async (): Promise<boolean | null> => {
  const supabase = crearCliente()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('usuarios').select('modo_oscuro').eq('id', user.id).maybeSingle()
  return (data?.modo_oscuro as boolean | null | undefined) ?? null
})
