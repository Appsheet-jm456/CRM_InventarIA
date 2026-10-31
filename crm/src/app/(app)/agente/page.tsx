import { redirect } from 'next/navigation'

// Mientras no exista la pestaña Resumen (F4·28), el módulo abre en Conocimiento.
export default function Agente() {
  redirect('/agente/conocimiento')
}
