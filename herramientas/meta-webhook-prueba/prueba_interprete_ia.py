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
f = interprete._limpiar('{"procesador": "I7", "generacion": "11", "ram_gb": "8", "uso": "Astronauta", "marca": "dell"}')
ok(f == {"procesador": "i7", "generacion": 11, "ram_gb": 8, "marca": "DELL"}, "textos a número, i7 en minúscula, uso desconocido fuera")
ok(interprete._limpiar('{"uso": "Gamer"}') == {"uso": "Gamer"}, "«Gamer» es un uso válido para el buscador")
ok(all(interprete.uso(t) == "Gamer" for t in ("portatiles gamer", "Portatiles Gaimer tienes?", "equipos para videojuegos", "para jugar fortnite")),
   "gamer, gaimer, videojuegos y jugar se entienden como Gamer (antes que «video» = diseño)")
ok(interprete.uso("edicion de video") == "Diseño", "edición de video sigue siendo Diseño")
_eq = lambda cod, uso, desc="": {"cod": cod, "marca": "X", "modelo": "M", "cpu": "i5-8250U", "gen": 8, "ram": "8GB", "disco": "", "precio": 1,
                                  "atributos": {"uso_recomendado": uso} if uso else {}, "descripcion": desc}
_lista = [_eq("A", "Gamer"), _eq("B", "Diseño y render"), _eq("C", ""), _eq("D", "", "PORTATIL X RTX 4050 6GB"), _eq("E", "", "PORTATIL X RTX A4000"),
          _eq("F", "Oficina y estudio", "PORTATIL X RTX 3060")]
ok([p["cod"] for p in interprete.filtrar(_lista, {"uso": "Gamer"}, lambda p: False)] == ["A", "D"],
   "uso Gamer: lo marcado Gamer, o sin marca con RTX/GTX de consumo; no la estación de trabajo ni lo marcado Oficina")
ok("B" in [p["cod"] for p in interprete.filtrar(_lista, {"uso": "Diseño"}, lambda p: False)], "uso Diseño incluye lo marcado «Diseño y render»")
ok(interprete._limpiar('{"procesador": "Ryzen 7", "ram_gb": [], "uso": null}') == {}, "procesador fuera de i3-i9 y listas vacías se descartan")
ok(interprete._limpiar('{"precio_max": {"min": 1}, "generacion": true}') == {}, "objetos y verdadero/falso se descartan")
ok(interprete._limpiar("no entendí") == {}, "sin JSON, sin filtros")

# F4·31: el buscador usa los modelos en la nube del Cerebro (OpenRouter), principal y respaldo; nunca el local por esta vía.
import types  # noqa: E402

registro = []
sys.modules["db"] = types.SimpleNamespace(pedir=lambda ruta, metodo="GET", cuerpo=None, prefer=None: registro.append(cuerpo))
falso = types.ModuleType("cerebro")
estado = {"config": None, "agotado": False, "falla": set(), "llamados": []}
falso.cargar = lambda: (estado["config"], {"llave": "x", "llave_respaldo": "x"})
falso.tope = lambda: {"agotado": estado["agotado"]}
falso.modelo = lambda c, ll, respaldo=False: (None if respaldo and not c.get("proveedor_respaldo") else
                                              {"proveedor": c["proveedor_respaldo" if respaldo else "proveedor"],
                                               "modelo": c["modelo_respaldo" if respaldo else "modelo"]})


def _llamar(m, mensajes, sistema, temperatura, tokens_max, espera):
    estado["llamados"].append(m["modelo"])
    if m["modelo"] in estado["falla"]:
        raise Exception("respondió 503")
    return {"texto": '{"marca": "lenovo", "ram_gb": 16}', "tokens_entrada": 100, "tokens_salida": 10, "costo_usd": 0.00001}


falso._llamar = _llamar
sys.modules["cerebro"] = falso
NUBE = {"proveedor": "openrouter", "modelo": "deepseek/deepseek-v4-flash", "proveedor_respaldo": "openrouter",
        "modelo_respaldo": "google/gemini-2.5-flash-lite", "tokens_max": 1000}

estado.update(config=NUBE)
ok(interprete._con_cerebro("lenovo de 16") == {"marca": "LENOVO", "ram_gb": 16} and estado["llamados"] == ["deepseek/deepseek-v4-flash"],
   "el buscador usa el modelo principal en la nube")
ok(registro[-1]["detalle"]["buscador"] and registro[-1]["proveedor"] == "openrouter", "queda en el Registro de IA como buscador")
estado.update(falla={"deepseek/deepseek-v4-flash"}, llamados=[])
ok(interprete._con_cerebro("lenovo de 16") == {"marca": "LENOVO", "ram_gb": 16}
   and estado["llamados"] == ["deepseek/deepseek-v4-flash", "google/gemini-2.5-flash-lite"], "si el principal falla, responde el respaldo")
ok(registro[-1]["detalle"].get("respaldo") is True, "el Registro marca que respondió el respaldo")
estado.update(falla={"deepseek/deepseek-v4-flash", "google/gemini-2.5-flash-lite"})
ok(interprete._con_cerebro("lenovo") is None, "si fallan los dos, None (sigue el modelo local)")
estado.update(config={**NUBE, "proveedor_respaldo": "local", "modelo_respaldo": "llama3.1"}, falla={"deepseek/deepseek-v4-flash"}, llamados=[])
ok(interprete._con_cerebro("lenovo") is None and estado["llamados"] == ["deepseek/deepseek-v4-flash"],
   "un respaldo local no se llama por esta vía (atiende de a uno)")
estado.update(config=NUBE, falla=set(), agotado=True, llamados=[])
ok(interprete._con_cerebro("lenovo") is None and estado["llamados"] == [], "con el presupuesto agotado no se usa la nube")
ok(interprete._con_cerebro("lenovo", simulador=True) is not None, "el Chat InventarIA (simulador) no cuenta para el tope")
estado.update(config={**NUBE, "proveedor": "local", "proveedor_respaldo": None}, agotado=False, llamados=[])
ok(interprete._con_cerebro("lenovo") is None and estado["llamados"] == [], "con el Cerebro solo local, el buscador no cambia")

print(f"\n{n - fallos}/{n} en verde" if not fallos else f"\n{fallos} de {n} fallaron")
sys.exit(1 if fallos else 0)
