#!/usr/bin/env python3
"""
Genera la EDT (mapa del proyecto) del CRM InventarIA a partir de docs/notion/tareas.csv.

    python3 docs/notion/edt_generar.py            # imprime el JSON de la pestaña «EDT detallada» (A1:O..)
    python3 docs/notion/edt_generar.py --resumen  # solo cuenta tareas por fase

Mismo modelo que la EDT de Misión Bezer. Fase = columna «Fase» del CSV; entregable = columna «Módulo»
(en el orden en que aparece). El avance cuenta solo tareas en estado Hecha. Las fórmulas usan «;»
porque la hoja está en configuración es_CO.
"""
import csv
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
FILAS = list(csv.DictReader(open(RAIZ / "docs/notion/tareas.csv", newline="", encoding="utf-8")))

S = []  # (código, fase, [(código, entregable, [tareas])])
for r in FILAS:
    num, nombre = [x.strip() for x in r["Fase"].split("·")]
    fase = next((f for f in S if f[0] == num), None)
    if not fase:
        fase = (num, nombre, [])
        S.append(fase)
    gs = fase[2]
    g = next((x for x in gs if x[1] == r["Módulo"]), None)
    if not g:
        g = (f"{num}.{len(gs) + 1}", r["Módulo"], [])
        gs.append(g)
    g[2].append(r)
S.sort(key=lambda f: int(f[0]))

PRIMERA = 5  # primera fila de datos (la 4 es el encabezado)
A, C, D = "$A$5:$A", "$C$5:$C", "$D$5:$D"


def avance(codigo):
    den = f'COUNTIFS({A};"{codigo}.*";{C};"Tarea")'
    return f'=IF({den}=0;0;COUNTIFS({A};"{codigo}.*";{D};"Hecha")/{den})'


filas, usadas = [], set()
for pc, pn, gs in S:
    filas.append(["'" + pc, pn, "Fase", None, None, None, avance(pc)])
    for gc, gn, ts in gs:
        filas.append(["'" + gc, gn, "Entregable", None, None, None, avance(gc)])
        for i, p in enumerate(ts, 1):
            t = p
            usadas.add(t["Tarea"])
            filas.append(["'" + f"{gc}.{i}", t["Tarea"], "Tarea", t["Estado"], t["Prioridad"], t["Referencia"], None])
if len(usadas) != len(FILAS):
    sys.exit("Hay tareas repetidas o sin ubicar en la EDT")

fases = [(pc, pn) for pc, pn, _ in S]
resumen = []
for i, (pc, pn) in enumerate(fases):
    r = PRIMERA + i
    resumen.append(["'" + pc, pn,
                    f'=COUNTIFS({A};I{r}&".*";{C};"Tarea")',
                    f'=COUNTIFS({A};I{r}&".*";{D};"Hecha")',
                    f'=COUNTIFS({A};I{r}&".*";{D};"En curso")',
                    f'=COUNTIFS({A};I{r}&".*";{D};"Pendiente")',
                    f"=IF(K{r}=0;0;L{r}/K{r})"])
tot = PRIMERA + len(fases)
fin = tot - 1
resumen.append([None, "Total", f"=SUM(K{PRIMERA}:K{fin})", f"=SUM(L{PRIMERA}:L{fin})", f"=SUM(M{PRIMERA}:M{fin})",
                f"=SUM(N{PRIMERA}:N{fin})", f"=IF(K{tot}=0;0;L{tot}/K{tot})"])

salida = [["EDT: CRM InventarIA"] + [None] * 14,
          ["Fuente: docs/notion/tareas.csv del repositorio. El avance cuenta solo tareas en estado Hecha. Solo lectura: se regenera con docs/notion/edt_generar.py."] + [None] * 14,
          [None] * 15,
          ["Código", "Elemento", "Tipo", "Estado", "Prioridad", "Referencia", "% avance", None,
           "Código", "Fase", "Tareas", "Hechas", "En curso", "Pendientes", "% avance"]]
for i in range(max(len(filas), len(resumen))):
    f = filas[i] if i < len(filas) else [None] * 7
    s = resumen[i] if i < len(resumen) else [None] * 7
    salida.append(f + [None] + s)

if "--resumen" in sys.argv:
    for pc, pn in fases:
        n = sum(1 for f in filas if f[2] == "Tarea" and f[0].startswith("'" + pc + "."))
        print(pc, pn, n)
    print("Total tareas:", sum(1 for f in filas if f[2] == "Tarea"))
else:
    print(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
