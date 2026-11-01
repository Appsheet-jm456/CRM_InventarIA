'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { guardarModoOscuro } from '@/app/(app)/apariencia/acciones'
import { cerrarSesion } from '@/app/login/acciones'
import { useAvisosBandeja } from '@/components/avisos'
import { Icono } from '@/components/Iconos'
import { Logo } from '@/components/Logo'
import type { Modulo } from '@/lib/modulos'

type Props = {
  modulos: Modulo[]
  usuario: { nombre: string; rol: string }
  // Ruta del logo de Apariencia; null = monograma «VV» (RA-13).
  logo: string | null
  // Con atender_bandeja: número de clientes esperando respuesta y avisos (RS-05).
  alertas?: boolean
  // F4·35, RF-34: con el chatbot apagado se avisa en toda la app (y quién puede, va a encenderlo).
  chatbot?: { apagado: boolean; menuApagado: boolean; puedeCambiar: boolean }
  children: React.ReactNode
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')

export function Shell({ modulos, usuario, logo, alertas = false, chatbot, children }: Props) {
  const espera = useAvisosBandeja(alertas)
  const ruta = usePathname()
  const [plegado, setPlegado] = useState(false)
  const [cajon, setCajon] = useState(false)

  useEffect(() => {
    try {
      setPlegado(localStorage.getItem('crm-plegado') === '1')
    } catch {}
  }, [])
  useEffect(() => setCajon(false), [ruta])

  const plegar = () => {
    const nuevo = !plegado
    setPlegado(nuevo)
    try {
      localStorage.setItem('crm-plegado', nuevo ? '1' : '0')
    } catch {}
  }

  // Atajo del modo oscuro (RA-08): se ve al instante y se guarda en el usuario (RA-09).
  const [oscuro, setOscuro] = useState(false)
  useEffect(() => {
    const ver = () => {
      const modo = document.documentElement.dataset.modo
      setOscuro(modo ? modo === 'oscuro' : matchMedia('(prefers-color-scheme: dark)').matches)
    }
    ver()
    const mm = matchMedia('(prefers-color-scheme: dark)')
    mm.addEventListener('change', ver)
    const obs = new MutationObserver(ver)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-modo'] })
    return () => {
      mm.removeEventListener('change', ver)
      obs.disconnect()
    }
  }, [])
  const alternarModo = () => {
    const nuevo = !oscuro
    document.documentElement.dataset.modo = nuevo ? 'oscuro' : 'claro'
    void guardarModoOscuro(nuevo)
  }

  const esActivo = (m: Modulo) => m.ruta === ruta || (m.ruta !== '/' && ruta.startsWith(m.ruta + '/'))
  const activo = modulos.find(esActivo)
  const grupos: { grupo: string | null; items: Modulo[] }[] = []
  for (const m of modulos) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.grupo === m.grupo) ultimo.items.push(m)
    else grupos.push({ grupo: m.grupo, items: [m] })
  }

  return (
    <div className={`app${plegado ? ' plegado' : ''}${cajon ? ' cajon' : ''}`}>
      <aside className="side" aria-label="Módulos">
        <div className="brand">
          <Logo ruta={logo} />
          <div className="brand-txt">
            <div className="brand-name">CRM InventarIA</div>
            <div className="brand-sub">Ventas Virtuales Colombia</div>
          </div>
        </div>
        <nav className="nav">
          {grupos.map(({ grupo, items }) => (
            <div key={grupo ?? 'inicio'} style={{ display: 'contents' }}>
              {grupo && <div className="nav-group">{grupo}</div>}
              {items.map((m) => (
                <Link
                  key={m.clave}
                  href={m.ruta}
                  className={esActivo(m) ? 'activo' : undefined}
                  title={m.titulo}
                  aria-current={esActivo(m) ? 'page' : undefined}
                >
                  <Icono nombre={m.icono} />
                  <span>{m.titulo}</span>
                  {m.clave === 'bandeja' && espera.pendientes > 0 && (
                    <span className={`contador${espera.vencidas > 0 ? ' vencido' : ''}`}
                      title={`${espera.pendientes} esperando respuesta${espera.vencidas ? `, ${espera.vencidas} fuera de SLA` : ''}`}>
                      {espera.pendientes}
                    </span>
                  )}
                  {m.paso && (
                    <span className="paso" title={`Se construye en ${m.paso}`}>
                      {m.paso.split(' ')[0]}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div className="avatar" aria-hidden="true">
            {iniciales(usuario.nombre)}
          </div>
          <div className="who">
            <b>{usuario.nombre}</b>
            <small>{usuario.rol}</small>
          </div>
          <button type="button" className="pie-modo" onClick={alternarModo}
            title={oscuro ? 'Modo claro' : 'Modo oscuro'} aria-label={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
            <Icono nombre={oscuro ? 'sol' : 'luna'} />
          </button>
          <form action={cerrarSesion}>
            <button className="salir" title="Salir" aria-label="Salir">
              <Icono nombre="salir" />
            </button>
          </form>
        </div>
      </aside>
      {cajon && <div className="scrim" onClick={() => setCajon(false)} />}

      <div className="main">
        <header className="top">
          <button className="iconbtn collapse-btn" onClick={plegar} aria-label="Abrir o cerrar el panel">
            <Icono nombre="panel" />
          </button>
          <button className="iconbtn menu-btn" onClick={() => setCajon(true)} aria-label="Abrir menú">
            <Icono nombre="menu" />
          </button>
          <div className="crumb">
            <small>{activo?.grupo ?? 'Inicio'}</small>
            <h1>{activo?.subtitulo ?? 'CRM InventarIA'}</h1>
          </div>
        </header>
        {(chatbot?.apagado || chatbot?.menuApagado) && (
          <div className="aviso-chatbot" role="status">
            <span>{chatbot.apagado
              ? '🤖 Chatbot apagado: nadie automático contesta y cada mensaje entra a la cola de la Bandeja.'
              : '🤖 Menú guiado apagado: solo Avi atiende; lo que él no atiende entra a la cola.'}</span>
            {chatbot.puedeCambiar && <Link href="/bot?t=interruptores">Interruptores</Link>}
          </div>
        )}
        <main className="content">
          <div className="view">{children}</div>
        </main>
      </div>
    </div>
  )
}
