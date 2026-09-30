import { notFound } from 'next/navigation'
import { SinPermiso } from '@/components/SinPermiso'
import { moduloPorRuta } from '@/lib/modulos'
import { obtenerSesion, puede } from '@/lib/sesion'

// Módulos que el panel ya muestra pero que se construyen en los pasos siguientes de la Fase 3.
export default async function ModuloEnConstruccion({ params }: { params: { modulo: string } }) {
  const modulo = moduloPorRuta(`/${params.modulo}`)
  if (!modulo?.paso) notFound()

  const sesion = (await obtenerSesion())!
  if (!puede(sesion, modulo.permisos)) return <SinPermiso />

  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>{modulo.titulo}</h2>
          <small>Se construye en el paso {modulo.paso} de la Fase 3.</small>
        </div>
        <span className="chip neu">En construcción</span>
      </div>
      <div className="panel-b muted">
        Aparece aquí para que el panel ya tenga su lugar y respete los permisos de tu rol. Mientras tanto, las
        conversaciones de la demo siguen en la Bandeja del puerto 8096.
      </div>
    </section>
  )
}
