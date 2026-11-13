"""Pruebas del enlace a la tienda web (F4·75, docs/TIENDA-WEB-EN-FICHAS.md RTW-01 a RTW-08), sin red ni base.

    python3 herramientas/meta-webhook-prueba/prueba_tienda_web.py
"""
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import agente, flujo

TIENDA = {"activa": True, "url": "https://ventasvirtualcolombia.com",
          "catalogo_url": "https://ventasvirtualcolombia.com/productos?categoria=portatil",
          "texto_equipo": "🌐 Ver en la web: {enlace}", "texto_catalogo": "🛒 Mira más equipos en la web: {enlace}"}
HTML = '<a href="/producto/100-102-1141">T490</a><a href="/producto/100-101-1152?x=1">Dell</a><a href="/productos">todo</a>'
pedidos = []


class Respuesta(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def urlopen_falso(pedido, timeout=None):
    pedidos.append(pedido.full_url)
    if fallar[0]:
        raise OSError("tienda caída")
    return Respuesta(HTML.encode())


fallar = [False]
flujo.urllib.request.urlopen = urlopen_falso
flujo.tienda = lambda: dict(TIENDA)
bien = mal = 0


def ok(condicion, descripcion):
    global bien, mal
    bien, mal = bien + bool(condicion), mal + (not condicion)
    print(f"{'ok' if condicion else 'not ok'} {bien + mal} - {descripcion}")


ok(flujo.renglon_web({"cod": "100-102-1141"}) == "🌐 Ver en la web: https://ventasvirtualcolombia.com/producto/100-102-1141",
   "RTW-01: equipo publicado → «🌐 Ver en la web» con su página")
ok(flujo.renglon_web({"cod": "100-101-1152"}).endswith("/producto/100-101-1152"), "el enlace con ?parámetros también cuenta como publicado")
ok(flujo.renglon_web({"cod": "999-999"}) == "🛒 Mira más equipos en la web: https://ventasvirtualcolombia.com/productos?categoria=portatil",
   "RTW-02: equipo sin página → el catálogo web")
ok(flujo.renglon_web({"cod": "999-999"}, respaldo=False) == "", "RTW-03: en una lista, el equipo sin página no lleva nada")
ok(len(pedidos) == 1 and pedidos[0] == "https://ventasvirtualcolombia.com/productos", "RTW-04: la tienda se lee una sola vez (5 minutos de caché)")

ficha = flujo.con_drive("💻 ficha", {"cod": "100-102-1141", "fotos_drive": "https://drive.google.com/d"})
ok(ficha == "💻 ficha\n📷 Más fotos: https://drive.google.com/d\n🌐 Ver en la web: https://ventasvirtualcolombia.com/producto/100-102-1141",
   "la ficha lleva primero «📷 Más fotos» y después el enlace web")
ok(flujo.con_drive("x" * 1010, {"cod": "100-102-1141"}) == "x" * 1010, "si el renglón no cabe en 1.024 caracteres, no se agrega")

flujo.tienda = lambda: {**TIENDA, "activa": False}
ok(flujo.renglon_web({"cod": "100-102-1141"}) == "", "RTW-05: con la tienda apagada no sale ningún enlace")
flujo.tienda = lambda: {**TIENDA, "catalogo_url": ""}
ok(flujo.renglon_web({"cod": "999-999"}) == "", "sin enlace de catálogo, el equipo sin página no lleva nada")

flujo.tienda = lambda: dict(TIENDA)
flujo._TIENDA.update(t=0.0, url=None, codigos=set())
fallar[0] = True
ok(flujo.renglon_web({"cod": "100-102-1141"}).startswith("🛒"), "RTW-06: si la tienda no responde, la ficha sale con el catálogo (nunca un enlace roto)")

fallar[0] = False
flujo._TIENDA.update(t=0.0)
lista = agente.textos_con_equipos("Mira estos:", [
    {"cod": "100-102-1141", "marca": "LENOVO", "modelo": "T490", "cpu": "i5", "ram": "8GB", "disco": "256GB", "estado": "Usado", "precio": 1, "stock": 1, "atributos": {}},
    {"cod": "999-999", "marca": "DELL", "modelo": "5490", "cpu": "i5", "ram": "8GB", "disco": "256GB", "estado": "Usado", "precio": 1, "stock": 1, "atributos": {}},
], "¿Cuál te gusta?", {"plantilla_equipo": "💻 {equipo} · {codigo}"})[0]
ok(lista.count("🌐 Ver en la web") == 1 and "producto/100-102-1141" in lista and "🛒" not in lista,
   "RTW-07: en la lista de Avi solo el equipo publicado lleva su enlace")

print(f"{'✗' if mal else '✓'} {bien}/{bien + mal}")
sys.exit(1 if mal else 0)
