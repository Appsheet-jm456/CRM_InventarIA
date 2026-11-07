"""
Pruebas de la limpieza de lo que devuelve la IA al extraer filtros (interprete._limpiar). Sin IA ni base.
Caso real (7 nov 2026): «Recomiéndame tres equipos de alto rendimiento» → Gemini devolvió listas y el árbol se cayó en describir().
Uso: python3 herramientas/meta-webhook-prueba/prueba_interprete_ia.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import interprete  # noqa: E402

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


f = interprete._limpiar('{"ram_gb": [16, 32, 64], "precio_max": 5000000, "uso": ["Ejecutivo", "Diseño"]}')
ok(f == {"ram_gb": 16, "precio_max": 5000000, "uso": "Diseño"}, "listas de la IA: un solo valor por filtro")
ok(interprete.describir(f) == "16 GB de RAM, para diseño, hasta $5.000.000", "describir no se cae con lo que devolvió la IA")
f = interprete._limpiar('{"procesador": "I7", "generacion": "11", "ram_gb": "8", "uso": "Gamer", "marca": "dell"}')
ok(f == {"procesador": "i7", "generacion": 11, "ram_gb": 8, "marca": "DELL"}, "textos a número, i7 en minúscula, uso desconocido fuera")
ok(interprete._limpiar('{"procesador": "Ryzen 7", "ram_gb": [], "uso": null}') == {}, "procesador fuera de i3-i9 y listas vacías se descartan")
ok(interprete._limpiar('{"precio_max": {"min": 1}, "generacion": true}') == {}, "objetos y verdadero/falso se descartan")
ok(interprete._limpiar("no entendí") == {}, "sin JSON, sin filtros")

print(f"\n{n - fallos}/{n} en verde" if not fallos else f"\n{fallos} de {n} fallaron")
sys.exit(1 if fallos else 0)
