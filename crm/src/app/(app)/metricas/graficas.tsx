// Piezas de Métricas que también usa el Inicio (RM-08).

export type Consumo = { mes: string; limite_gratis: number; salientes: number; servicio: number; cobrables: number;
                        sin_categoria: number; por_categoria: Record<string, number> }

const CATEGORIAS: Record<string, string> = { service: 'Servicio', utility: 'Utilidad', marketing: 'Marketing', authentication: 'Autenticación' }
export const pct = (n: number, de: number) => (de > 0 ? Math.round((n / de) * 100) : 0)

export function Barra({ etiqueta, valor, de, texto, color }: { etiqueta: string; valor: number; de: number; texto: string; color?: string }) {
  return (
    <div className="barra">
      <span title={etiqueta} className="barra-etq">{etiqueta}</span>
      <div className="barra-pista" role="img" aria-label={`${etiqueta}: ${texto}`}>
        <div className="barra-relleno" style={{ width: `${pct(valor, de)}%`, background: color }} />
      </div>
      <span className="mono r">{texto}</span>
    </div>
  )
}

// RM-08: mensajes de servicio del mes contra los 1.000 gratis, sin pesos hasta F1·6.
export function ConsumoMeta({ c, compacto = false }: { c: Consumo; compacto?: boolean }) {
  const uso = pct(c.servicio, c.limite_gratis)
  const nivel = uso >= 100 ? 'bad' : uso >= 80 ? 'warn' : 'ok'
  const mes = new Date(`${c.mes}T12:00:00-05:00`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'America/Bogota' })
  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>Consumo de Meta · {mes}</h2>
          <small>Mensajes de servicio contra los {c.limite_gratis.toLocaleString('es-CO')} gratis del mes (decisión 0011). Solo el conteo: las tarifas se confirman en F1·6.</small>
        </div>
        <span className={`chip ${nivel}`}>{uso} %</span>
      </div>
      <div className="panel-b barras">
        {uso >= 80 && (
          <div className={`aviso ${nivel}`} role="alert">
            {uso >= 100
              ? 'Se pasaron los 1.000 mensajes gratis: desde aquí Meta cobra cada mensaje de servicio entregado.'
              : `Van ${c.servicio} de ${c.limite_gratis} mensajes gratis del mes. Revisa el medio de pago en el Billing Hub.`}
          </div>
        )}
        <Barra etiqueta="Servicio" valor={Math.min(c.servicio, c.limite_gratis)} de={c.limite_gratis}
          texto={`${c.servicio.toLocaleString('es-CO')} / ${c.limite_gratis.toLocaleString('es-CO')}`}
          color={nivel === 'ok' ? undefined : `var(--${nivel})`} />
        {!compacto && (
          <small className="muted">
            {c.salientes} salientes en el mes · <b>{c.cobrables} cobrables</b> según Meta
            {Object.entries(c.por_categoria).map(([k, n]) => ` · ${CATEGORIAS[k] ?? k}: ${n}`).join('')}
            {c.sin_categoria ? ` · ${c.sin_categoria} sin categoría aún` : ''}
          </small>
        )}
      </div>
    </section>
  )
}
