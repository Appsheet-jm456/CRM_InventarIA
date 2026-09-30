'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cerrarSesion } from '@/app/login/acciones'
import { useAvisosBandeja } from '@/components/avisos'
import { Icono } from '@/components/Iconos'
import type { Modulo } from '@/lib/modulos'

type Props = {
  modulos: Modulo[]
  usuario: { nombre: string; rol: string }
  // Con atender_bandeja: número de clientes esperando respuesta y avisos (RS-05).
  alertas?: boolean
  children: React.ReactNode
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')

export function Shell({ modulos, usuario, alertas = false, children }: Props) {
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
          <div className="logo" aria-hidden="true">
            VV
          </div>
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
        <main className="content">
          <div className="view">{children}</div>
        </main>
      </div>
    </div>
  )
}
