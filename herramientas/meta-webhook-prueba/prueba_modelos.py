"""
Pruebas de la búsqueda por modelo en el texto libre (3 nov 2026): «X1 Yoga Gen 6» es un modelo; su «Gen 6» no es la generación del
procesador. Sin base ni WhatsApp. Uso: python3 herramientas/meta-webhook-prueba/prueba_modelos.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import interprete

def equipo(cod, marca, modelo, gen, ram, precio):
    return {"cod": cod, "marca": marca, "modelo": modelo, "cpu": "Core i7-1185G7", "gen": gen, "ram": ram, "disco": "512GB", "precio": precio, "estado": "Usado",
            "stock": 1, "categoria": "Portatil", "descripcion": ""}

INV = [equipo("YOGA6", "LENOVO", "X1 YOGA GEN 6", 11, "32GB", 2900000), equipo("YOGA5", "LENOVO", "X1 YOGA GEN 5", 10, "16GB", 1750000),
       equipo("CARB8", "LENOVO", "X1 CARBON GEN 8", 10, "16GB", 1600000), equipo("T560", "LENOVO", "T560", 6, "16GB", 1300000),
       equipo("Y700", "LENOVO", "IDEAPAD Y700 15ISK", 6, "8GB", 1450000), equipo("T14", "LENOVO", "T14 GEN 1", 10, "16GB", 1250000),
       equipo("D5420", "DELL", "5420", 11, "8GB", 1050000), equipo("D5410", "DELL", "LATITUDE 5410", 10, "16GB", 1250000),
       equipo("D5490", "DELL", "LATITUDE 5490", 8, "8GB", 800000), equipo("INSP", "DELL", "INSPIRON 14", 11, "16GB", 2500000),
       equipo("ZB", "HP", "ZBOOK FIRE FLY", 11, "16GB", 2500000), equipo("GIGA", "GIGABYTE", "GAMING A16 CMH", 13, "16GB", 4000000)]
fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def buscar(texto):
    f = interprete.reglas(texto, [p["marca"] for p in INV], INV)
    return f, [p["cod"] for p in interprete.filtrar(INV, f, lambda p: False)]


f, r = buscar("Hay X1 Yoga Gen 6 32 GB 512 GB?")
ok(r == ["YOGA6"], "«X1 Yoga Gen 6 32 GB 512 GB» encuentra ese equipo")
ok("generacion" not in f and f["marca"] == "LENOVO", "«Gen 6» no se toma como generación del procesador y deduce la marca")
ok("X1 YOGA GEN 6" in interprete.describir(f) and "generación" not in interprete.describir(f), "la respuesta nombra el modelo")
ok(buscar("Tienes equipos Lenovo X1 yoga gen 6 ?")[1] == ["YOGA6"], "el mensaje real de la prueba del dueño")
ok(buscar("tienes x1 yoga")[1] == ["YOGA5", "YOGA6"], "sin «gen» trae los dos X1 Yoga, del más barato al más caro")
ok(buscar("x1 carbon")[1] == ["CARB8"], "«x1 carbon» no trae los X1 Yoga")
f, r = buscar("x1 yoga gen 9")
ok(r == [] and {p["cod"] for p in interprete.cercanos(INV, f)} >= {"YOGA5", "YOGA6"} and [p["cod"] for p in interprete.cercanos(INV, f)][0] in ("YOGA5", "YOGA6"),
   "una gen que no hay: no encuentra y ofrece primero los X1 Yoga")
f, r = buscar("x1 yoga gen 6 16 gb")
ok(r == [] and interprete.cercanos(INV, f)[0]["cod"] in ("YOGA5", "YOGA6"), "el modelo con otra RAM: no inventa y ofrece ese modelo primero")
ok(buscar("Lenovo T14")[1] == ["T14"], "«Lenovo T14» ya no trae todos los Lenovo")
ok(buscar("dell 5420")[1] == ["D5420"], "«dell 5420» por su número")
ok(buscar("latitude 5410")[1] == ["D5410"], "«latitude 5410» no trae la 5490")
ok(buscar("zbook")[1] == ["ZB"], "«zbook» por su línea")
ok(buscar("inspiron 14")[1] == ["INSP"], "«inspiron 14»")
ok("cods" not in buscar("lenovo i7 gen 11")[0] and buscar("lenovo i7 gen 11")[0]["generacion"] == 11, "sin modelo, «gen 11» sigue siendo del procesador")
ok(buscar("5420 gen 11")[0].get("generacion") == 11 and buscar("5420 gen 11")[1] == ["D5420"], "un modelo sin «gen» respeta la generación del procesador")
ok("cods" not in buscar("16 gb de ram")[0], "«16 gb» no es un modelo")
ok("cods" not in buscar("tengo 14 pulgadas")[0], "un número suelto no es un modelo")
ok("cods" not in buscar("equipos gaming")[0], "«gaming» solo no apunta a un modelo")
ok("cods" not in interprete.reglas("Dell i5 de decima", ["DELL"]), "sin inventario, las reglas funcionan como antes")

print(f"\n{n - fallos} de {n} pruebas bien")
sys.exit(1 if fallos else 0)
