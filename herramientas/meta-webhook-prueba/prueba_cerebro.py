"""
Pruebas del cerebro (F4·27). Un servidor falso hace de proveedor de IA; la base se reemplaza por datos fijos y no se escribe nada.
Uso:  python3 herramientas/meta-webhook-prueba/prueba_cerebro.py
"""

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import cerebro  # noqa: E402

PEDIDOS = []
MODO = {}  # ruta -> ("ok" | "500" | "vacio" | "lento")


class Falso(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        cuerpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        PEDIDOS.append((self.path, dict(self.headers), cuerpo))
        modo = MODO.get(self.path.split("/")[1], "ok")
        if modo == "403-una-vez":  # falla la primera vez y después responde (como Gemini)
            MODO[self.path.split("/")[1]] = "ok"
            self.send_response(403); self.end_headers(); self.wfile.write(b"{}"); return
        if modo == "401":
            self.send_response(401); self.end_headers(); self.wfile.write(b"{}"); return
        if modo == "500":
            self.send_response(500); self.end_headers(); self.wfile.write(b"{}"); return
        if modo == "lento":
            import time; time.sleep(2)
        texto = "" if modo == "vacio" else "Hola, soy Avi"
        if self.path.endswith("/messages"):
            salida = {"content": [{"type": "text", "text": texto}], "usage": {"input_tokens": 1000, "output_tokens": 500}}
        else:
            salida = {"choices": [{"message": {"content": texto}}], "usage": {"prompt_tokens": 1000, "completion_tokens": 500}}
        try:
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps(salida).encode())
        except BrokenPipeError:
            pass  # el cliente ya se cansó de esperar (prueba del tiempo máximo)


servidor = ThreadingHTTPServer(("127.0.0.1", 0), Falso)
threading.Thread(target=servidor.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{servidor.server_port}"

TURNOS = []
cerebro.PAUSA_REINTENTO = 0
cerebro.registrar = lambda lead, m, resultado, r=None, detalle=None: TURNOS.append((m["proveedor"], resultado, (r or {}).get("costo_usd", 0)))
TOPE = {"agotado": False}
cerebro.tope = lambda: TOPE

CONFIG = {"proveedor": "deepseek", "modelo": "deepseek-chat", "url_base": f"{URL}/principal", "protocolo": "openai",
          "precio_entrada_usd": 0.28, "precio_salida_usd": 0.42,
          "proveedor_respaldo": "local", "modelo_respaldo": "qwen3", "url_base_respaldo": f"{URL}/respaldo", "protocolo_respaldo": "openai",
          "precio_entrada_usd_respaldo": 0, "precio_salida_usd_respaldo": 0,
          "temperatura": 0.3, "tokens_max": 600, "espera_segundos": 1}
LLAVES = {"llave": "sk-principal-1234567890", "llave_respaldo": None}
MSG = [{"role": "user", "content": "hola"}]

fallos = 0


def prueba(n, texto, cond):
    global fallos
    print(("ok" if cond else "not ok") + f" {n} - {texto}")
    fallos += 0 if cond else 1


def pedir(**kw):
    PEDIDOS.clear(); TURNOS.clear()
    return cerebro.completar(MSG, sistema="Eres Avi.", config=kw.pop("config", CONFIG), llaves=kw.pop("llaves", LLAVES), **kw)


# 1-3: camino feliz con la API compatible con OpenAI
MODO.clear()
r = pedir()
prueba(1, "responde con el modelo principal y cuenta tokens", r["texto"] == "Hola, soy Avi" and r["tokens_entrada"] == 1000 and r["tokens_salida"] == 500 and not r["respaldo"])
prueba(2, "el costo sale de los precios por millón de tokens (0,28 + 0,21 por mil/500 tokens = US$ 0,00049)", abs(r["costo_usd"] - 0.00049) < 1e-9)
ruta, cab, cuerpo = PEDIDOS[0]
prueba(3, "manda la llave como Bearer y el sistema como primer mensaje", cab.get("Authorization") == "Bearer sk-principal-1234567890" and cuerpo["messages"][0] == {"role": "system", "content": "Eres Avi."} and ruta == "/principal/chat/completions")

# 4-6: respaldo
MODO["principal"] = "500"
r = pedir()
prueba(4, "si el principal falla, responde el respaldo", r["respaldo"] and r["proveedor"] == "local")
prueba(5, "el respaldo local no necesita llave ni cuesta", "Authorization" not in PEDIDOS[-1][1] and r["costo_usd"] == 0)
prueba(6, "queda anotado el error del principal y el turno del respaldo", TURNOS == [("deepseek", "error", 0), ("local", "respondido", 0)])
MODO["principal"] = "lento"
r = pedir()
prueba(7, "si el principal tarda más de la espera, responde el respaldo", r["respaldo"])
MODO["principal"] = "vacio"
r = pedir()
prueba(8, "una respuesta vacía cuenta como fallo", r["respaldo"])

# 9-10: fallan todos
MODO["principal"] = "500"; MODO["respaldo"] = "500"
try:
    pedir(); ok = False
except cerebro.CerebroError:
    ok = True
prueba(9, "si fallan los dos, lanza CerebroError para que atienda el Híbrido", ok)
MODO.clear()
r = pedir(llaves={"llave": None})
prueba(10, "sin llave en el principal usa el respaldo en vez de fallar", r["respaldo"] and TURNOS[0] == ("deepseek", "error", 0))

# 11-13: presupuesto
TOPE["agotado"] = True
try:
    pedir(); ok = False
except cerebro.TopeAgotado:
    ok = True
prueba(11, "con el presupuesto agotado no llama a ningún modelo y lo anota", ok and not PEDIDOS and TURNOS == [("deepseek", "tope", 0)])
r = pedir(simulador=True)
prueba(12, "el simulador sigue funcionando con el tope agotado y se anota aparte", r["texto"] and TURNOS == [("deepseek", "simulador", r["costo_usd"])])
TOPE["agotado"] = False
local = dict(CONFIG, proveedor="local", url_base=f"{URL}/principal")
TOPE["agotado"] = True
r = pedir(config=local)
prueba(13, "un modelo local nunca se detiene por el presupuesto", r["texto"] == "Hola, soy Avi")
TOPE["agotado"] = False

# 14-15: Anthropic
claude = dict(CONFIG, proveedor="anthropic", modelo="claude-haiku-5-5", url_base=f"{URL}/ant", protocolo="anthropic")
r = pedir(config=claude)
ruta, cab, cuerpo = PEDIDOS[0]
prueba(14, "Anthropic: va a /v1/messages con x-api-key y el sistema aparte", ruta == "/ant/v1/messages" and cab.get("X-Api-Key") == "sk-principal-1234567890" and cuerpo["system"] == "Eres Avi." and all(m["role"] != "system" for m in cuerpo["messages"]))
prueba(15, "Anthropic: lee el texto y los tokens de su formato", r["texto"] == "Hola, soy Avi" and r["tokens_salida"] == 500)

# 16: direcciones
try:
    pedir(config=dict(CONFIG, url_base="ftp://x.co", proveedor_respaldo=None)); ok = False
except cerebro.CerebroError:
    ok = True
prueba(16, "una dirección que no es http(s) se rechaza", ok)

# 17-18: reintento de errores pasajeros
MODO.clear(); MODO["principal"] = "403-una-vez"
r = pedir()
prueba(17, "un error pasajero (403 de Gemini) se reintenta una vez y responde el principal", not r["respaldo"] and len([p for p in PEDIDOS if p[0].startswith("/principal")]) == 2)
MODO.clear(); MODO["principal"] = "401"
r = pedir()
prueba(18, "una llave mala (401) no se reintenta: pasa directo al respaldo", r["respaldo"] and len([p for p in PEDIDOS if p[0].startswith("/principal")]) == 1)

servidor.shutdown()
print(f"\n{18 - fallos}/18 pruebas bien")
sys.exit(1 if fallos else 0)
