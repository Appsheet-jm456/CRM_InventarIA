"""
Pruebas de las acciones que envían catálogos y archivos (F4·43, docs/AGENTE.md RAG-49 a RAG-53): catálogo fijo, el de la marca del
equipo (o el Unificado si la marca no tiene), PDF como documento y Drive como enlace, archivo subido en la acción y catálogo al final
de la ficha. Sin base ni WhatsApp. Uso: python3 herramientas/meta-webhook-prueba/prueba_catalogos_acciones.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import acciones, db, flujo


def equipo(cod, marca, modelo):
    return {"cod": cod, "marca": marca, "modelo": modelo, "cpu": "Core i5", "gen": 10, "ram": "16GB", "disco": "256GB", "estado": "Usado",
            "precio": 1500000, "stock": 1, "categoria": "Portatil", "descripcion": "", "foto": None, "atributos": {}}


INV = [equipo("LG7-01", "LENOVO", "LEGION 7"), equipo("HP840", "HP", "ELITEBOOK 840 G8"), equipo("AC1", "ACER", "PREDATOR HELIOS")]
CAT = {"LENOVO": {"id": 268, "nombre": "Catálogo Lenovo", "marca": "LENOVO", "tipo": "drive", "url": "https://drive.google.com/lenovo"},
       "HP": {"id": 39, "nombre": "Catálogo HP PDF", "marca": "HP", "tipo": "pdf", "url": "", "archivo": "hp.pdf"},
       "": {"id": 271, "nombre": "Catálogo Unificado", "marca": "", "tipo": "drive", "url": "https://drive.google.com/todos"}}
flujo.inventario = lambda: INV
db.sin_stock = lambda cods: {str(c).upper() for c in cods} - {p["cod"].upper() for p in flujo.inventario() if p.get("stock", 1) > 0}  # F4·66: el stock sale del inventario de la prueba, no de la base
flujo.texto_horario = lambda: "L–V 8–18"
db.productos_agotados = lambda: []
db.catalogo_para = lambda categoria, marca: (CAT.get(marca) or CAT[""], None)
db.catalogo = lambda i: next((c for c in CAT.values() if c["id"] == i), None)
db.agente_config = lambda fresco=False: {"plantilla_equipo": "💻 {equipo}", "max_equipos": 3}
fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def correr(hacer, texto="", lead=None, st=None, equipo_hallado=None):
    a = {"id": 1, "nombre": "x", "cuando": [{"forma": "contiene", "texto": "catalogo"}], "hacer": hacer}
    if equipo_hallado:
        a["_equipo"] = equipo_hallado
    st = st or flujo.estado_vacio()
    r = acciones.ejecutar(a, st, lead, texto=texto)
    return r[0] if r else []


texto = lambda m: (m.get("text") or {}).get("body", "")

m = correr([{"tipo": "catalogo", "modo": "lista", "catalogo_id": 268}])
ok(len(m) == 1 and "https://drive.google.com/lenovo" in texto(m[0]) and "*Catálogo Lenovo*" in texto(m[0]), "catálogo fijo de Drive: enlace en el texto")
m = correr([{"tipo": "catalogo", "modo": "lista", "catalogo_id": 39, "texto": "Hola {nombre}, aquí va 📚"}], lead={"nombre": "Ana Ruiz"})
ok(texto(m[0]) == "Hola Ana, aquí va 📚" and m[1].get("_pdf", {}).get("id") == 39, "catálogo PDF: texto antes y el PDF como documento")
ok(correr([{"tipo": "catalogo", "modo": "lista", "catalogo_id": 999}]) == [], "un catálogo apagado o borrado no envía nada (RAG-52)")

hallado = acciones.detectar_equipo("cuanto vale el legion 7")
m = correr([{"tipo": "catalogo", "modo": "marca"}], equipo_hallado=hallado)
ok("Te envío el catálogo de Lenovo" in texto(m[0]) and "lenovo" in texto(m[0]), "«el de la marca»: la del equipo que encontró el disparador")
st = flujo.estado_vacio()
st["campos"]["Código producto"] = "HP840"
m = correr([{"tipo": "catalogo", "modo": "marca"}], st=st)
ok(m[-1].get("_pdf", {}).get("id") == 39, "«el de la marca»: sin disparador, la del último equipo que vio el cliente")
m = correr([{"tipo": "catalogo", "modo": "marca"}], equipo_hallado=acciones.detectar_equipo("y el predator helios"))
ok("Unificado" in texto(m[0]), "si la marca no tiene catálogo, el Unificado")
m = correr([{"tipo": "catalogo", "modo": "unificado"}])
ok("Unificado" in texto(m[0]) and "nuestros equipos" in texto(m[0]), "«el Unificado» y {marca} sin marca dice «nuestros equipos»")

m = correr([{"tipo": "archivo", "archivo": "acciones/1.pdf", "nombre": "Ficha técnica HP 840", "texto": "Te comparto la ficha técnica 👇"}])
ok(texto(m[0]) == "Te comparto la ficha técnica 👇" and m[1] == {"_conocimiento": {"archivo": "acciones/1.pdf", "titulo": "Ficha técnica HP 840"}},
   "archivo de la acción: texto antes y el PDF")
ok(correr([{"tipo": "archivo", "archivo": "", "nombre": "x"}]) == [], "sin archivo subido no envía nada")

m = correr([{"tipo": "ficha_equipo", "catalogo": True, "foto": False}], texto="cuanto vale el legion 7", equipo_hallado=hallado)
ok(len(m) == 2 and "LEGION 7" in texto(m[0]) and "drive.google.com/lenovo" in texto(m[1]), "ficha del equipo con el catálogo de la marca al final")
m = correr([{"tipo": "ficha_equipo", "foto": False}], texto="cuanto vale el legion 7", equipo_hallado=hallado)
ok(len(m) == 1, "sin la casilla, solo la ficha")

p = acciones.probar("catalogo", [{"id": 5, "nombre": "Catálogo", "activa": True, "cuando": [{"forma": "contiene", "texto": "catalogo"}],
                                  "hacer": [{"tipo": "catalogo", "modo": "lista", "catalogo_id": 39}]}])
ok(p["accion"]["id"] == 5 and p["mensajes"][-1] == {"type": "archivo", "archivo": "hp.pdf", "titulo": "Catálogo HP PDF"},
   "«Probar con una frase» muestra el catálogo PDF que se adjuntaría")
ok(acciones.lista({"hacer": [{"tipo": "catalogo"}, {"tipo": "archivo"}]}), "los pasos nuevos se pueden activar")
m = correr([{"tipo": "texto", "texto": "¡Hola {nombre}! 👋 Tenemos equipos"}], lead={"nombre": None})
ok(texto(m[0]) == "¡Hola! 👋 Tenemos equipos", "sin nombre del cliente, «¡Hola {nombre}!» queda «¡Hola!»")

print(f"{'✅' if not fallos else '✗'} {n - fallos}/{n}")
sys.exit(1 if fallos else 0)
