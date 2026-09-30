import { SinPermiso } from '@/components/SinPermiso'
import { listarPlantillas } from '@/lib/meta'
import { PLANTILLAS_CRM } from '@/lib/plantillasCrm'
import { obtenerSesion, puede } from '@/lib/sesion'
import { EnviarAprobacion } from './EnviarAprobacion'

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  APPROVED: { texto: 'Aprobada', clase: 'ok' },
  PENDING: { texto: 'En revisión', clase: 'warn' },
  REJECTED: { texto: 'Rechazada', clase: 'bad' },
  PAUSED: { texto: 'Pausada', clase: 'warn' },
  DISABLED: { texto: 'Desactivada', clase: 'bad' },
}
const CATEGORIAS: Record<string, string> = { UTILITY: 'Utilidad', MARKETING: 'Marketing', AUTHENTICATION: 'Autenticación' }

export default async function Canal() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_canal'])) return <SinPermiso />
  const { plantillas, error } = await listarPlantillas()
  const existentes = new Set(plantillas.map((p) => p.nombre))

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Plantillas de la cuenta</h2>
            <small>Las lee de Meta. Solo las aprobadas se pueden enviar desde la Bandeja fuera de la ventana de 24 h (RS-06).</small>
          </div>
        </div>
        {error && <div className="panel-b"><div className="aviso bad">{error}</div></div>}
        <div className="tablewrap">
          <table>
            <thead><tr><th>Nombre</th><th>Idioma</th><th>Categoría</th><th>Estado</th><th>Texto</th></tr></thead>
            <tbody>
              {plantillas.map((p) => (
                <tr key={`${p.nombre}|${p.idioma}`}>
                  <td className="mono">{p.nombre}</td>
                  <td>{p.idioma}</td>
                  <td>{CATEGORIAS[p.categoria] ?? p.categoria}</td>
                  <td><span className={`chip ${ESTADOS[p.estado]?.clase ?? 'neu'}`}>{ESTADOS[p.estado]?.texto ?? p.estado}</span></td>
                  <td className="muted" style={{ maxWidth: 480 }}>{p.cuerpo}{!p.usable && p.estado === 'APPROVED' && ' · (no se puede llenar desde la app)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Plantillas propuestas por el CRM</h2>
            <small>Categoría Utilidad, en español. Meta las revisa (de minutos a un día) y puede pasarlas a Marketing si las ve promocionales.</small>
          </div>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Nombre</th><th>Texto</th><th></th></tr></thead>
            <tbody>
              {PLANTILLAS_CRM.map((p) => (
                <tr key={p.nombre}>
                  <td className="mono">{p.nombre}</td>
                  <td>{p.cuerpo}</td>
                  <td className="r">
                    {existentes.has(p.nombre) ? <span className="chip neu">Ya está en Meta</span> : <EnviarAprobacion nombre={p.nombre} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
