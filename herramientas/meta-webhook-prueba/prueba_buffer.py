"""
Pruebas del buffer de Avi en el receptor (F4·28): mensajes seguidos de un cliente se juntan en una sola respuesta.
No escribe en la base ni envía a WhatsApp. Uso:  python3 herramientas/meta-webhook-prueba/prueba_buffer.py
"""

import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import receptor  # noqa: E402

GUARDADOS, ATENDIDOS = [], []
LEAD = {"id": 7, "telefono": "573001112233"}
receptor.db.lead = lambda numero: LEAD
receptor.db.guardar_mensaje = lambda lead_id, lado, texto, *a, **k: GUARDADOS.append(texto)
receptor.db.agente_config = lambda fresco=False: {"buffer_segundos": 1}
receptor.cargar_estado = lambda lead: {"pausa": False, "campos": {}}
receptor.agente.atiende = lambda st, lead, tipo, entrada, config=None: True
receptor.acciones.ganadora = lambda texto: {"nombre": "Pasar a asesor"} if "asesor" in texto else None
receptor.anotar = lambda texto: None  # no ensucia eventos.log
receptor._contestar = lambda numero, entrada, visible, nombre, tipo, meta_id, media=None, guardado=False: ATENDIDOS.append((entrada, guardado))

fallos = 0


def prueba(n, texto, cond):
    global fallos
    print(("ok" if cond else "not ok") + f" {n} - {texto}")
    fallos += 0 if cond else 1


hilos = []
for i, t in enumerate(["hola", "busco un portátil", "i5"]):
    h = threading.Thread(target=receptor.contestar, args=("573001112233", t, t, "", "text", f"wamid.{i}"))
    h.start(); hilos.append(h)
    time.sleep(0.1)
for h in hilos:
    h.join()
prueba(1, "tres mensajes seguidos dan una sola respuesta de Avi con todo junto", ATENDIDOS == [("hola\nbusco un portátil\ni5", True)])
prueba(2, "cada mensaje queda guardado al llegar (la Bandeja los ve de una)", GUARDADOS == ["hola", "busco un portátil", "i5"])

GUARDADOS.clear(); ATENDIDOS.clear()
receptor.contestar("573001112233", "quiero un asesor", "quiero un asesor", "", "text", "wamid.9")
prueba(3, "lo que atiende una Acción responde al instante, sin esperar", ATENDIDOS == [("quiero un asesor", False)] and not GUARDADOS)
ATENDIDOS.clear()
receptor.contestar("573001112233", "x", "[imagen]", "", "image", "wamid.10", {"id": "1"})
prueba(4, "una foto o un archivo no espera el buffer", ATENDIDOS and ATENDIDOS[0][1] is False)
ATENDIDOS.clear()
receptor.db.agente_config = lambda fresco=False: {"buffer_segundos": 0}
t0 = time.time()
receptor.contestar("573001112233", "hola", "hola", "", "text", "wamid.11")
prueba(5, "con el buffer en 0 responde al instante", ATENDIDOS == [("hola", False)] and time.time() - t0 < 0.5)

print(f"\n{5 - fallos}/5 pruebas bien")
sys.exit(1 if fallos else 0)
