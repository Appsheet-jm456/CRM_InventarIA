"""
F5·8: al encender el servidor, el receptor espera a la base en vez de salir y reiniciarse (el 7 nov 2026 se reinició 22 veces).
Sin base ni Meta: db.pedir es falso y la espera no duerme.
Uso: python3 herramientas/meta-webhook-prueba/prueba_arranque.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import db  # noqa: E402
import receptor  # noqa: E402

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def base_que_sube_tras(intentos):
    llamadas = {"n": 0}

    def pedir(ruta, metodo="GET", cuerpo=None, prefer=None):
        llamadas["n"] += 1
        if llamadas["n"] <= intentos:
            raise ConnectionRefusedError("la base aún no sube")
        return {"phone_number_id": "1"}
    db._meta.update(t=0, config=None, ok=False)
    db.pedir = pedir
    return llamadas


pausas = []
llamadas = base_que_sube_tras(5)
ok(receptor.esperar_base(dormir=pausas.append) is True, "espera hasta que la base responde y sigue")
ok(len(pausas) == 5 and llamadas["n"] == 6, "reintenta cada pocos segundos sin salir del programa")

pausas = []
base_que_sube_tras(0)
ok(receptor.esperar_base(dormir=pausas.append) is True and pausas == [], "con la base arriba no espera nada")

pausas = []
base_que_sube_tras(10 ** 6)
ok(receptor.esperar_base(limite=0, dormir=pausas.append) is False, "si la base nunca responde, se rinde al llegar al límite")

print(f"\n{n - fallos}/{n} en verde" if not fallos else f"\n{fallos} de {n} fallaron")
sys.exit(1 if fallos else 0)
