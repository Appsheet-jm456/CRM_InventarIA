// Logo de la app (RA-12, RA-13): el que subió el administrador en Apariencia o el monograma «VV».
export function Logo({ ruta }: { ruta: string | null }) {
  if (!ruta)
    return (
      <div className="logo" aria-hidden="true">
        VV
      </div>
    )
  return (
    <div className="logo imagen" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- lo sirve la propia app, ya reducido */}
      <img src={ruta} alt="" />
    </div>
  )
}
