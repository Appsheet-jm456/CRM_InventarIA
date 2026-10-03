import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SinPermiso } from '@/components/SinPermiso'
import { canalSeguro } from '@/lib/canalSeguro'
import { conexionMeta } from '@/lib/metaConexion'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { Desconectar, AccionesRapidas, RegistrarWebhook } from './AccionesMeta'
import { FormMeta } from './FormMeta'
import { Comprobaciones } from './Piezas'
import type { Paso } from '@/lib/metaPrueba'

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }) : null
const elDia = (iso: string | null) => (iso ? `el ${fecha(iso)}` : null)

// Dirección pública del receptor: la que se fije en el entorno o, mientras tanto, la del túnel de prueba.
function urlPublica() {
  if (process.env.WEBHOOK_URL_PUBLICA) return process.env.WEBHOOK_URL_PUBLICA
  try {
    const url = readFileSync(path.join(process.cwd(), '..', 'herramientas/meta-webhook-prueba/tunel-url.txt'), 'utf-8').trim()
    return url ? `${url}/webhook` : ''
  } catch {
    return ''
  }
}

export default async function Meta() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_meta'])) return <SinPermiso />

  const supabase = crearCliente()
  const [{ data: c }, { data: historial }, actual] = await Promise.all([
    supabase.from('meta_conexion')
      .select('estado, app_id, waba_id, phone_number_id, numero_visible, nombre_verificado, calidad, token_guardado_en, app_secret_guardado_en, verify_token_guardado_en, ultima_prueba_en, ultima_prueba, actualizado_en')
      .eq('id', 1).single(),
    supabase.from('meta_conexion_historial').select('id, en, accion, campos, detalle, usuarios(nombre)').order('en', { ascending: false }).limit(20),
    conexionMeta(),
  ])
  const conectada = c?.estado === 'conectada'
  const canal = canalSeguro()
  const pasos = ((c?.ultima_prueba as { pasos?: { clave: string; estado: Paso['estado']; detalle: string }[] } | null)?.pasos ?? [])
  const titulos: Record<string, [string, boolean]> = {
    app_secret: ['El App Secret corresponde a esa app', true], token: ['El token es válido y trae los permisos de WhatsApp', true],
    numero: ['El número está conectado', true], waba: ['El número pertenece a esa WABA', true],
    suscripcion: ['La app está suscrita a la WABA', false], webhook: ['La app tiene un webhook de WhatsApp', false],
  }
  const suscrita = pasos.length ? pasos.find((p) => p.clave === 'suscripcion')?.estado === 'ok' : null

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Conexión con Meta</h2>
            <small>Aquí se cambia la app, el número y las claves del bot sin tocar el servidor. Los secretos se guardan cifrados y nunca se vuelven a mostrar.</small>
          </div>
          <span className={`chip ${conectada ? 'ok' : actual ? 'warn' : 'bad'}`}>
            {conectada ? 'Conectada' : actual ? 'Usando .env.meta' : 'Sin conexión'}
          </span>
        </div>
        <div className="panel-b" style={{ display: 'grid', gap: 10 }}>
          {conectada && (
            <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
              <div><small className="muted">Número</small><div>{c?.numero_visible ?? '—'} · {c?.nombre_verificado ?? '—'}</div></div>
              <div><small className="muted">Calidad</small><div>{c?.calidad ?? '—'}</div></div>
              <div><small className="muted">Token</small><div className="mono">••••••••••••••••••••</div></div>
              <div><small className="muted">App Secret</small><div className="mono">••••••••••••••••••••</div></div>
              <div><small className="muted">Token de verificación</small><div className="mono">••••••••••••••••••••</div></div>
              <div><small className="muted">Última prueba</small><div>{fecha(c?.ultima_prueba_en ?? null) ?? '—'}</div></div>
            </div>
          )}
          {!conectada && actual && (
            <div className="aviso warn">
              Hoy el bot usa las claves de <span className="mono">.env.meta</span>. Para pasarlas a la base, escribe el token y el App
              Secret abajo, o déjalos vacíos para importar los del archivo, y pulsa «Probar y guardar».
            </div>
          )}
          {!conectada && !actual && <div className="aviso bad">No hay conexión con Meta: el bot no puede enviar ni recibir mensajes.</div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-h"><h2>{conectada ? 'Cambiar la conexión' : 'Conectar con Meta'}</h2></div>
        <FormMeta
          valores={{ appId: c?.app_id ?? actual?.appId ?? '', wabaId: c?.waba_id ?? actual?.wabaId ?? '', phoneNumberId: c?.phone_number_id ?? actual?.phoneNumberId ?? '' }}
          guardados={{
            token: conectada ? elDia(c?.token_guardado_en ?? null) : actual ? 'en .env.meta' : null,
            appSecret: conectada ? elDia(c?.app_secret_guardado_en ?? null) : actual?.appSecret ? 'en .env.meta' : null,
          }}
          seguro={canal.seguro}
          motivo={canal.motivo}
        />
        {pasos.length > 0 && (
          <div className="panel-b">
            <small className="muted">Resultado de la última prueba</small>
            <Comprobaciones pasos={pasos.map((p) => ({ clave: p.clave, titulo: titulos[p.clave]?.[0] ?? p.clave, critico: titulos[p.clave]?.[1] ?? false, estado: p.estado, detalle: p.detalle }))} />
          </div>
        )}
      </section>

      {conectada && (
        <section className="panel">
          <div className="panel-h">
            <div>
              <h2>Webhook y suscripción</h2>
              <small>Meta entrega los mensajes del cliente a esta dirección. Con un túnel de prueba cambia en cada reinicio; con dominio propio queda fija (F2·10).</small>
            </div>
          </div>
          <div className="panel-b" style={{ display: 'grid', gap: 14 }}>
            <RegistrarWebhook urlInicial={urlPublica()} seguro={canal.seguro} />
            <AccionesRapidas suscrita={suscrita} />
          </div>
        </section>
      )}

      {conectada && (
        <section className="panel">
          <div className="panel-h">
            <div>
              <h2>Desconectar</h2>
              <small>Borra los tres secretos. El bot deja de enviar y recibir mensajes hasta que vuelvas a conectar.</small>
            </div>
          </div>
          <div className="panel-b"><Desconectar /></div>
        </section>
      )}

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Historial</h2>
            <small>Quién cambió la conexión y qué campos. Nunca guarda valores.</small>
          </div>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Campos</th></tr></thead>
            <tbody>
              {(historial ?? []).map((h) => (
                <tr key={h.id}>
                  <td className="mono">{fecha(h.en)}</td>
                  <td>{(h.usuarios as unknown as { nombre: string } | null)?.nombre ?? '—'}</td>
                  <td>{h.accion}{h.detalle ? ` · ${h.detalle}` : ''}</td>
                  <td className="muted">{(h.campos as string[]).join(', ')}</td>
                </tr>
              ))}
              {!historial?.length && <tr><td colSpan={4} className="muted">Todavía no hay cambios.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
