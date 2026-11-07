'use client'

import { useCallback, useEffect, useState } from 'react'
import { clienteNavegador } from '@/lib/supabase/navegador'
import { guardarDocumento, type Resultado } from '../../servicio-tecnico/acciones'
import { CHECKLIST, ESTADO, hora, type Pedido } from '../../servicio-tecnico/ServicioTecnico'

type Fila = Pick<Pedido, 'id' | 'equipos' | 'doc_tipo' | 'doc_numero' | 'estado' | 'tecnico' | 'tomado_en' | 'listo_en' | 'listo_por' | 'checklist'> & {
  oportunidades: { estado: string; etapas: { nombre: string } | null } | null
}

// F4·50 bloque A (RAL-02, RAL-03): en la ficha del cliente el asesor ve el alistamiento y pone el OP o la FVE que le da contabilidad.
export function AlistamientoCliente({ lead, puedeDocumento, version, alCambiar }: {
  lead: number; puedeDocumento: boolean; version: number; alCambiar: () => void
}) {
  const [fila, setFila] = useState<Fila | null>(null)
  const [tipo, setTipo] = useState<'OP' | 'FVE'>('FVE')
  const [numero, setNumero] = useState('')
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    const { data } = await clienteNavegador().from('alistamientos')
      .select('id, equipos, doc_tipo, doc_numero, estado, tecnico, tomado_en, listo_en, listo_por, checklist, oportunidades(estado, etapas(nombre))')
      .eq('lead_id', lead).order('creado_en', { ascending: false }).limit(1)
    const f = ((data ?? [])[0] as unknown as Fila | undefined) ?? null
    setFila(f)
    if (f?.doc_tipo) setTipo(f.doc_tipo)
    setNumero(f?.doc_numero ?? '')
  }, [lead])

  useEffect(() => { setAviso({}); cargar() }, [cargar, version])

  if (!fila) return null
  const etapa = fila.oportunidades?.etapas?.nombre ?? ''
  const enCurso = fila.oportunidades?.estado === 'abierta' && etapa === 'Alistamiento'

  async function guardar() {
    setOcupado(true)
    const r = await guardarDocumento(fila!.id, lead, tipo, numero)
    setOcupado(false)
    setAviso(r)
    cargar()
    alCambiar()
  }

  return (
    <div className="dato" style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>🛠 Alistamiento · servicio técnico</b>
        <span className={`chip ${enCurso ? ESTADO[fila.estado].clase : 'neu'}`}>{enCurso ? ESTADO[fila.estado].texto : etapa || 'Cerrado'}</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {fila.equipos.map((e) => <li key={e.codigo}>💻 {e.nombre} <small className="muted">· {e.codigo}</small></li>)}
      </ul>
      <small className="muted">
        {fila.tecnico ? <>Técnico: <b>{fila.tecnico}</b>{fila.tomado_en && ` · tomó ${hora(fila.tomado_en)}`}</> : 'Aún sin técnico.'}
        {fila.listo_en && <> · listo para despachar {hora(fila.listo_en)}{fila.listo_por && ` (${fila.listo_por})`}</>}
      </small>
      {Object.keys(fila.checklist).length > 0 && (
        <small>{CHECKLIST.filter(([k]) => fila.checklist[k]).map(([, t]) => `✔ ${t}`).join(' · ')}</small>
      )}
      <div className="field">
        Documento del pedido (OP de garantía POS o FVE)
        {puedeDocumento && enCurso ? (
          <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); guardar() }}>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as 'OP' | 'FVE')} disabled={ocupado} aria-label="Tipo de documento">
              <option value="FVE">FVE · factura electrónica</option>
              <option value="OP">OP · garantía (POS)</option>
            </select>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Número que da contabilidad" maxLength={40}
              disabled={ocupado} aria-label="Número del documento" style={{ flex: '1 1 140px' }} />
            <button className="btn primary chico" disabled={ocupado || !numero.trim() || (numero.trim() === fila.doc_numero && tipo === fila.doc_tipo)}>Guardar</button>
          </form>
        ) : fila.doc_numero ? <span className="chip ok">{fila.doc_tipo} {fila.doc_numero}</span> : <span className="chip bad">Sin documento</span>}
        {enCurso && !fila.doc_numero && <small className="muted">El técnico no puede marcar «listo para despachar» hasta que pongas el documento.</small>}
      </div>
      {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}
    </div>
  )
}
