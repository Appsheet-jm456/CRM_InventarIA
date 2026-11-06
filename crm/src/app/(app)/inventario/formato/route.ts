import { crearCliente } from '@/lib/supabase/server'

// Formato de la hoja de carga (RI-09): las columnas fijas más una por atributo activo, con una fila de ejemplo.
export async function GET() {
  const { data } = await crearCliente().from('producto_atributos').select('nombre, tipo, opciones')
    .is('archivado_en', null).order('orden').order('id')
  const atributos = data ?? []
  const celda = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const ejemplo = (a: { tipo: string; opciones: unknown }) =>
    a.tipo === 'si_no' ? 'Sí' : a.tipo === 'numero' ? '0' : a.tipo === 'lista' ? String((a.opciones as string[])[0] ?? '') : ''
  const encabezado = ['Código', 'Categoría', 'Marca', 'Modelo', 'Procesador', 'Generación', 'RAM', 'Disco', 'Estado', 'Precio', 'Stock',
    'Descripción', 'Video', ...atributos.map((a) => a.nombre)]
  const fila = ['100-102-9999', 'Portatil', 'DELL', 'LATITUDE 5420', 'Core i5-1145G7', '11', '16GB', '256GB NVMe', 'Usado', '1450000', '1',
    'Ejemplo: borra esta fila', '', ...atributos.map(ejemplo)]
  const csv = '﻿' + [encabezado, fila].map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n'
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="formato-inventario.csv"' },
  })
}
