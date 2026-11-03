"""
Pruebas de las 10 fichas de Avi y el catálogo al final (3 nov 2026): tope de 10 equipos por respuesta, búsqueda por modelo en la herramienta y
catálogo de la marca (o el unificado) cerrando la lista. Sin base ni WhatsApp. Uso: python3 herramientas/meta-webhook-prueba/prueba_fichas.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import agente, db, flujo

def equipo(cod, marca, modelo, ram="16GB", precio=1000000, gen=10):
    return {"cod": cod, "marca": marca, "modelo": modelo, "cpu": "Core i5-10310U", "gen": gen, "ram": ram, "disco": "256GB SSD", "estado": "Usado",
            "precio": precio, "stock": 1, "categoria": "Portatil", "descripcion": "", "foto": "", "video": ""}

INV = [equipo(f"L{i:02}", "LENOVO", f"T14 GEN {i}", precio=1000000 + i * 10000) for i in range(1, 13)]
INV += [equipo("YOGA6", "LENOVO", "X1 YOGA GEN 6", "32GB", 2900000, 11), equipo("YOGA2", "LENOVO", "X1 YOGA GEN 2", "8GB", 1190000, 7),
        equipo("D1", "DELL", "LATITUDE 5410"), equipo("D2", "DELL", "LATITUDE 5420"), equipo("A1", "ACER", "PREDATOR HELIOS")]
CAT = {"LENOVO": {"id": 268, "nombre": "Catálogo Lenovo", "marca": "LENOVO", "tipo": "drive", "url": "https://drive.google.com/lenovo"},
       "": {"id": 271, "nombre": "Catálogo Unificado", "marca": "", "tipo": "drive", "url": "https://drive.google.com/todos"},
       "DELL": {"id": 9, "nombre": "Catálogo PDF", "marca": "DELL", "tipo": "pdf", "url": ""}}
PEDIDO = []
db.catalogo_para = lambda categoria, marca: (CAT.get(marca) or CAT[""], None)
flujo.inventario = lambda: INV
flujo.es_diseno = lambda p: False
fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


CONFIG = {"plantilla_equipo": agente.PLANTILLA_EQUIPO, "equipos_separados": False, "max_equipos": 10}
codigos = [p["cod"] for p in INV]
ok(len(agente.equipos_pedidos(codigos, 10)) == 10, "pide 17 y muestra 10 (el tope)")
ok(len(agente.equipos_pedidos(codigos[:4], 10)) == 4, "«hasta 10» es un tope: con 4 muestra 4")

lenovo = agente.equipos_pedidos([p["cod"] for p in INV if p["marca"] == "LENOVO"], 10)
cat, pdf = agente.catalogo_final(lenovo)
ok(pdf is None and "📚 *Catálogo Lenovo*" in cat and "https://drive.google.com/lenovo" in cat, "todos Lenovo: el catálogo de Lenovo con su enlace")
cat2, _ = agente.catalogo_final(agente.equipos_pedidos(["L01", "D1"], 10))
ok("📚 *Catálogo Unificado*" in cat2, "equipos de varias marcas: el catálogo unificado")
cat3, _ = agente.catalogo_final(agente.equipos_pedidos(["A1"], 10))
ok("📚 *Catálogo Unificado*" in cat3, "una marca sin catálogo propio: el unificado")
cat4, pdf4 = agente.catalogo_final(agente.equipos_pedidos(["D1"], 10))
ok(pdf4 and pdf4["id"] == 9 and "https://" not in cat4, "un catálogo en PDF va como documento aparte, sin enlace")
db.catalogo_para = lambda categoria, marca: (None, None)
ok(agente.catalogo_final(lenovo) == (None, None), "sin catálogo cargado la lista sale sin él")
db.catalogo_para = lambda *a: (_ for _ in ()).throw(RuntimeError("base caída"))
ok(agente.catalogo_final(lenovo) == (None, None), "si la base falla la lista sale sin catálogo")
db.catalogo_para = lambda categoria, marca: (CAT.get(marca) or CAT[""], None)

t = agente.textos_con_equipos("No tengo ese X1 Yoga. Lo más cercano:", lenovo, "¿Te sirve alguno?", CONFIG, cat)
ok(len(t) == 1 and t[0].count("💻") == 10 and t[0].startswith("No tengo ese X1 Yoga") and t[0].endswith("¿Te sirve alguno?"), "un solo mensaje: frase, 10 fichas y pregunta")
ok(t[0].index("📚") > t[0].rindex("💻") and t[0].index("📚") < t[0].index("¿Te sirve"), "el catálogo va después de la última ficha y antes de la pregunta")
ok(len(t[0]) < 4096, f"el mensaje de 10 fichas cabe en WhatsApp ({len(t[0])} caracteres)")
largo = [dict(p, modelo="MODELO " + "X" * 260) for p in lenovo]
t = agente.textos_con_equipos("Mira:", largo, "¿Te sirve alguno?", CONFIG, cat)
ok(len(t[0]) <= 4096 and t[0].endswith("¿Te sirve alguno?") and "📚" in t[0], "si no cabe, se quita un equipo antes de cortar el catálogo y la pregunta")
t = agente.textos_con_equipos("Mira:", lenovo[:2], "¿Te sirve?", dict(CONFIG, equipos_separados=True), cat)
ok(len(t) == 5 and t[3] == cat and t[4] == "¿Te sirve?", "con un mensaje por equipo, el catálogo va antes de la pregunta")
ok(agente.textos_con_equipos("Mira:", lenovo[:1], "¿Te sirve?", CONFIG) == ["Mira:\n\n" + agente.armar_equipo(None, lenovo[0]) + "\n\n¿Te sirve?"],
   "sin catálogo (llamada de antes) el resultado no cambia")

# La herramienta buscar_productos
def buscar(args, maximo=10):
    ctx = {"st": flujo.estado_vacio(), "lead": {}, "config": {"max_equipos": maximo}, "simulador": True, "permitido": set(), "texto_permitido": "",
           "extra": [], "avance": False, "nota": [], "asesor": False, "flujo": None, "trozos": 0}
    return agente.usar("buscar_productos", args, ctx)[0]


r = buscar({"modelo": "X1 Yoga Gen 6"})
ok([e["codigo"] for e in r["equipos"]] == ["YOGA6"] and r["coincide_exacto"], "modelo «X1 Yoga Gen 6»: encuentra solo ese")
r = buscar({"modelo": "x1 yoga"})
ok({e["codigo"] for e in r["equipos"]} == {"YOGA6", "YOGA2"}, "modelo «x1 yoga»: los dos X1 Yoga, sin otros Lenovo")
r = buscar({"modelo": "X1 Yoga Gen 9"})
ok(not r["coincide_exacto"] and r["equipos"][0]["codigo"] in ("YOGA6", "YOGA2"), "un modelo con otra generación: no inventa y ofrece primero los X1 Yoga")
r = buscar({"marca": "Lenovo"})
ok(len(r["equipos"]) == 10, "«qué tienes en Lenovo»: 10 equipos, no 5")
ok(r["total_que_cumplen"] == 14, "dice cuántos cumplen en total, para avisar que hay más")
r = buscar({"marca": "Lenovo"}, maximo=4)
ok(len(r["equipos"]) == 4, "el tope de la pantalla se respeta")
r = buscar({"modelo": "zzz inexistente", "marca": "Dell"})
ok({e["codigo"] for e in r["equipos"]} == {"D1", "D2"}, "un modelo que no existe se ignora y valen los otros filtros")

print(f"\n{n - fallos} de {n} pruebas bien")
sys.exit(1 if fallos else 0)
