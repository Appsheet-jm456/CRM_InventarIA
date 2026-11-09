'use client'

export const MOTIVOS = ['No compró', 'Precio', 'Sin respuesta', 'No calificado', 'Compró en otro lado', 'Solo preguntaba', 'Otro']

export const MOTIVOS_CANCELAR = ['No compró', 'Novedad del cliente', 'Sin respuesta', 'Otro']

// RE-06: cerrar como perdida pide el motivo, en cualquier embudo.
export function MotivoPerdida({ etapa, alElegir, alCancelar }: { etapa: string; alElegir: (motivo: string) => void; alCancelar: () => void }) {
  return (
    <div className="modal" onClick={alCancelar}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Motivo de pérdida">
        <h3>¿Por qué pasa a {etapa}?</h3>
        <div className="row">
          {MOTIVOS.map((m) => (
            <button key={m} className="btn" onClick={() => alElegir(m)}>{m}</button>
          ))}
        </div>
        <button className="btn chico" onClick={alCancelar}>Cancelar</button>
      </div>
    </div>
  )
}
