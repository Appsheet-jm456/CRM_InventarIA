// Las fechas que escribe el asesor son hora de Colombia (sin horario de verano), sin importar la zona
// del navegador o del servidor.
const ZONA = 'America/Bogota'

export function diaBogota(fecha = new Date(), masDias = 0) {
  const d = new Date(fecha.getTime() + masDias * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: ZONA })
}

// Valor para <input type="datetime-local"> en hora de Colombia: "2026-10-01T09:00".
export function enDias(dias: number, hora = 9) {
  return `${diaBogota(new Date(), dias)}T${String(hora).padStart(2, '0')}:00`
}

// "2026-10-01T09:00" (hora de Colombia) → ISO en UTC.
export function isoDeBogota(local: string) {
  const d = new Date(`${local}:00-05:00`)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}
