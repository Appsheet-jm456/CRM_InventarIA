'use client'

import { useState } from 'react'
import { PROVEEDORES, type Modelo, type Proveedor } from '@/lib/cerebroProveedores'
import { guardarCerebro, guardarLlave, probarConexion, type DatosCerebro, type Prueba, type Resultado } from './acciones'

type Tope = { gasto: number; presupuesto: number; porcentaje: number | null; agotado: boolean; turnos_mes: number }
type Turno = { en: string; proveedor: string; modelo: string; tokens_entrada: number; tokens_salida: number; costo_usd: number; resultado: string; ms: number | null }

const usd = (n: number) => `US$ ${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

function BloqueModelo({ titulo, m, onCambio, tieneLlave, guardadaEn, respaldo, ocupado }: {
  titulo: string
  m: Modelo
  onCambio: (m: Modelo) => void
  tieneLlave: boolean
  guardadaEn: string | null
  respaldo: boolean
  ocupado: boolean
}) {
  const [llave, setLlave] = useState('')
  const [aviso, setAviso] = useState<Resultado>({})
  const [prueba, setPrueba] = useState<Prueba | null>(null)
  const [trabajando, setTrabajando] = useState<'llave' | 'prueba' | null>(null)
  const local = m.proveedor === 'local'
  const ayuda = PROVEEDORES.find((p) => p.id === m.proveedor)?.ayuda

  const elegir = (id: Proveedor) => {
    const p = PROVEEDORES.find((x) => x.id === id)!
    onCambio({ proveedor: id, ...p.base })
  }
  const poner = <K extends keyof Modelo>(k: K, v: Modelo[K]) => onCambio({ ...m, [k]: v })

  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>{titulo}</h2>
          <small>{ayuda}</small>
        </div>
        {local ? <span className="chip ok">No necesita llave</span>
          : tieneLlave ? <span className="chip ok">Llave guardada{guardadaEn ? ` · ${new Date(guardadaEn).toLocaleDateString('es-CO')}` : ''}</span>
          : <span className="chip warn">Sin llave</span>}
      </div>
      <div className="panel-b" style={{ display: 'grid', gap: 14 }}>
        <div className="row">
          <label className="field" style={{ flex: '1 1 220px' }}>
            Proveedor
            <select value={m.proveedor} disabled={ocupado} onChange={(e) => elegir(e.target.value as Proveedor)}>
              {PROVEEDORES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: '1 1 220px' }}>
            Modelo
            <input value={m.modelo} disabled={ocupado} onChange={(e) => poner('modelo', e.target.value)} placeholder="deepseek-chat" />
          </label>
        </div>
        <div className="row">
          <label className="field" style={{ flex: '2 1 320px' }}>
            Dirección del servicio
            <input value={m.url_base} disabled={ocupado} onChange={(e) => poner('url_base', e.target.value)} placeholder="https://api.deepseek.com" />
          </label>
          <label className="field" style={{ flex: '1 1 200px' }}>
            Tipo de API
            <select value={m.protocolo} disabled={ocupado} onChange={(e) => poner('protocolo', e.target.value as Modelo['protocolo'])}>
              <option value="openai">Compatible con OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
        </div>
        <div className="row">
          <label className="field" style={{ flex: '0 1 240px' }}>
            Precio de entrada (US$ por millón de tokens)
            <input type="number" min={0} step={0.01} value={m.precio_entrada_usd} disabled={ocupado}
              onChange={(e) => poner('precio_entrada_usd', Number(e.target.value))} />
          </label>
          <label className="field" style={{ flex: '0 1 240px' }}>
            Precio de salida (US$ por millón de tokens)
            <input type="number" min={0} step={0.01} value={m.precio_salida_usd} disabled={ocupado}
              onChange={(e) => poner('precio_salida_usd', Number(e.target.value))} />
          </label>
          <small className="muted" style={{ flex: '1 1 220px', alignSelf: 'end' }}>
            Solo sirven para estimar el costo. Confírmalos en la página del proveedor: cambian.
          </small>
        </div>

        {!local && (
          <form className="row" onSubmit={async (e) => {
            e.preventDefault()
            setTrabajando('llave'); setAviso(await guardarLlave(llave, respaldo)); setTrabajando(null)
            setLlave('')
          }}>
            <label className="field" style={{ flex: '1 1 320px' }}>
              {tieneLlave ? 'Cambiar la llave de API' : 'Llave de API'}
              <input type="password" autoComplete="off" value={llave} disabled={ocupado || trabajando !== null}
                onChange={(e) => setLlave(e.target.value)} placeholder={tieneLlave ? '•••••••• (pega una nueva para cambiarla)' : 'Pega aquí la llave'} />
              <small className="muted">Se guarda cifrada y nunca se vuelve a mostrar.</small>
            </label>
            <button className="btn" style={{ alignSelf: 'center' }} disabled={ocupado || trabajando !== null || llave.trim().length < 20}>
              {trabajando === 'llave' ? 'Guardando…' : 'Guardar llave'}
            </button>
          </form>
        )}
        {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}

        <div className="row">
          <button type="button" className="btn" disabled={ocupado || trabajando !== null}
            onClick={async () => { setTrabajando('prueba'); setPrueba(null); setPrueba(await probarConexion(respaldo)); setTrabajando(null) }}>
            {trabajando === 'prueba' ? 'Probando…' : 'Probar conexión'}
          </button>
          <small className="muted">Prueba el modelo <b>ya guardado</b> (guarda los cambios primero).</small>
        </div>
        {prueba && (
          <div className={`aviso ${prueba.error ? 'bad' : 'ok'}`} role="alert">
            {prueba.error ? `No conectó: ${prueba.error}`
              : `Conectó en ${((prueba.ms ?? 0) / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} s · respondió «${prueba.texto}» · ${prueba.tokens} tokens · ${usd(prueba.costo_usd ?? 0)}`}
          </div>
        )}
      </div>
    </section>
  )
}

export function Cerebro({ datos, llaves, tope, turnos }: {
  datos: DatosCerebro
  llaves: { principal: boolean; respaldo: boolean; guardada_en: string | null }
  tope: Tope
  turnos: Turno[]
}) {
  const [d, setD] = useState<DatosCerebro>(datos)
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const cambio = JSON.stringify(d) !== JSON.stringify(datos)
  const pct = Math.min(100, tope.porcentaje ?? 0)
  const local = datos.principal.proveedor === 'local'

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Cerebro del agente</h2>
            <small>El modelo de IA que usará Avi. Si el principal falla o tarda más de {datos.espera_segundos} s, responde el de respaldo; si fallan los dos, atiende el modo Híbrido.</small>
          </div>
          {tope.agotado && !local ? <span className="chip bad">Presupuesto agotado: el agente pasa los chats a un asesor</span>
            : (tope.porcentaje ?? 0) >= 80 && !local ? <span className="chip warn">Más del 80 % del presupuesto</span> : null}
        </div>
        <div className="panel-b" style={{ display: 'grid', gap: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span><b>{usd(tope.gasto)}</b> gastados este mes{!local && tope.presupuesto > 0 ? ` de ${usd(tope.presupuesto)}` : ''}</span>
            <span className="muted">{tope.turnos_mes.toLocaleString('es-CO')} respuestas de IA · el simulador no cuenta</span>
          </div>
          {!local && tope.presupuesto > 0 && (
            <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Gasto del mes"
              style={{ height: 8, borderRadius: 4, background: 'var(--line, #ddd)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: tope.agotado ? 'var(--bad, #c0392b)' : pct >= 80 ? 'var(--warn, #d68910)' : 'var(--accent, #2563eb)' }} />
            </div>
          )}
          {!local && tope.presupuesto === 0 && <small className="muted">Presupuesto en 0: el agente no se puede encender para clientes hasta que pongas uno abajo.</small>}
        </div>
      </section>

      <BloqueModelo titulo="Modelo principal" m={d.principal} onCambio={(m) => setD({ ...d, principal: m })} respaldo={false}
        tieneLlave={llaves.principal} guardadaEn={llaves.guardada_en} ocupado={ocupado} />

      {d.respaldo ? (
        <>
          <BloqueModelo titulo="Modelo de respaldo" m={d.respaldo} onCambio={(m) => setD({ ...d, respaldo: m })} respaldo
            tieneLlave={llaves.respaldo} guardadaEn={null} ocupado={ocupado} />
          <div className="row">
            <button type="button" className="btn" disabled={ocupado} onClick={() => setD({ ...d, respaldo: null })}>Quitar el respaldo</button>
          </div>
        </>
      ) : (
        <section className="panel">
          <div className="panel-b row" style={{ justifyContent: 'space-between' }}>
            <small className="muted">Sin respaldo: si el principal falla, atiende el modo Híbrido. Se recomienda el modelo local, que es gratis.</small>
            <button type="button" className="btn" disabled={ocupado}
              onClick={() => setD({ ...d, respaldo: { proveedor: 'local', ...PROVEEDORES.find((p) => p.id === 'local')!.base } })}>
              Agregar respaldo
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Límites y presupuesto</h2>
            <small>Al llegar al presupuesto, Avi pregunta «¿Quieres que te atienda un asesor?» y el chat pasa a la Bandeja. Menú, acciones, compra y cotización siguen funcionando.</small>
          </div>
        </div>
        {(aviso.error || aviso.ok) && (
          <div className="panel-b" style={{ paddingBottom: 0 }}>
            <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
          </div>
        )}
        <form className="panel-b" style={{ display: 'grid', gap: 14 }}
          onSubmit={async (e) => { e.preventDefault(); setOcupado(true); setAviso(await guardarCerebro(d)); setOcupado(false) }}>
          <div className="row">
            <label className="field" style={{ flex: '0 1 220px' }}>
              Presupuesto mensual (US$)
              <input type="number" min={0} step={1} value={d.presupuesto_usd} disabled={ocupado}
                onChange={(e) => setD({ ...d, presupuesto_usd: Number(e.target.value) })} />
              <small className="muted">Al 80 % avisa en Inicio y Métricas.</small>
            </label>
            <label className="field" style={{ flex: '0 1 200px' }}>
              Temperatura (0 a 1,5)
              <input type="number" min={0} max={1.5} step={0.1} value={d.temperatura} disabled={ocupado}
                onChange={(e) => setD({ ...d, temperatura: Number(e.target.value) })} />
              <small className="muted">Baja = más exacto.</small>
            </label>
            <label className="field" style={{ flex: '0 1 200px' }}>
              Largo máximo (tokens)
              <input type="number" min={100} max={4000} step={50} value={d.tokens_max} disabled={ocupado}
                onChange={(e) => setD({ ...d, tokens_max: Number(e.target.value) })} />
            </label>
            <label className="field" style={{ flex: '0 1 200px' }}>
              Espera máxima (segundos)
              <input type="number" min={5} max={60} value={d.espera_segundos} disabled={ocupado}
                onChange={(e) => setD({ ...d, espera_segundos: Number(e.target.value) })} />
            </label>
          </div>
          <div className="row">
            <button className="btn primary" disabled={ocupado || !cambio}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
            {cambio && <button type="button" className="btn" disabled={ocupado} onClick={() => setD(datos)}>Deshacer</button>}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-h"><div><h2>Últimas respuestas de IA</h2><small>Cada turno guarda tokens, costo y resultado (RAG-18). Aún vacío: el agente se conecta en F4·28.</small></div></div>
        {turnos.length > 0 && (
          <div className="panel-b" style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Cuándo</th><th>Modelo</th><th>Tokens</th><th>Costo</th><th>Resultado</th></tr></thead>
              <tbody>
                {turnos.map((t) => (
                  <tr key={t.en}>
                    <td>{new Date(t.en).toLocaleString('es-CO')}</td>
                    <td>{t.proveedor} · {t.modelo}</td>
                    <td>{t.tokens_entrada + t.tokens_salida}</td>
                    <td>{usd(Number(t.costo_usd))}</td>
                    <td>{t.resultado}{t.ms ? ` · ${(t.ms / 1000).toFixed(1)} s` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
