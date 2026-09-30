// Una acción que redirige a la misma página deja el estado del formulario en undefined.
export function Aviso({ resultado }: { resultado?: { error?: string; ok?: string } }) {
  if (!resultado) return null
  if (resultado.error)
    return (
      <div className="aviso bad" role="alert">
        {resultado.error}
      </div>
    )
  if (resultado.ok) return <div className="aviso ok">{resultado.ok}</div>
  return null
}
