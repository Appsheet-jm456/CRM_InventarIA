"""
F4·31 · Prueba de carga: N clientes escribiendo a la vez, con el receptor real, la base real y la IA real, SIN enviar nada a Meta.

Llama a receptor.procesar() en hilos (como hace el servidor web con cada webhook) y reemplaza el envío a Meta por uno falso que
tarda lo que tarda Meta (~0,3 s). Los clientes son números falsos 5799955xxxxx y se borran al final (con sus mensajes y todo).
Mide cuánto tarda el bot en responder a cada mensaje, si alguno quedó sin respuesta y si se guardaron todos los mensajes.

OJO: mientras corre, los clientes falsos aparecen en la Bandeja del equipo y pueden sonar avisos. Correrla con el equipo avisado.
Uso:  python3 herramientas/meta-webhook-prueba/prueba_carga.py --ejecutar [--clientes 100]
      python3 herramientas/meta-webhook-prueba/prueba_carga.py --limpiar     (borra los clientes falsos si quedó alguno)
"""

import argparse
import random
import statistics
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import db  # noqa: E402
import receptor  # noqa: E402

PREFIJO = "5799955"
MENSAJES = ["hola", "busco un portátil lenovo i5", "tienes algo para diseño con 16 gb de ram por menos de dos palos?"]
envios = {}  # número → [instantes en que el bot «envió»]
candado = threading.Lock()


def enviar_falso(numero, mensaje):
    time.sleep(0.3)  # lo que tarda Meta en aceptar un mensaje
    with candado:
        envios.setdefault(str(numero), []).append(time.monotonic())
    return f"wamid.CARGA{random.randint(0, 10**12)}"


def limpiar():
    filas = db.pedir(f"leads?telefono=like.{PREFIJO}*&select=id") or []
    if filas:
        db.pedir(f"leads?telefono=like.{PREFIJO}*", "DELETE", prefer="return=minimal")
    print(f"🧹 {len(filas)} clientes falsos borrados (con sus mensajes, oportunidades y seguimientos)")


def evento(numero, texto, i):
    return {"entry": [{"changes": [{"value": {
        "contacts": [{"wa_id": numero, "profile": {"name": f"Prueba carga {numero[-4:]}"}}],
        "messages": [{"from": numero, "id": f"wamid.CARGAIN{numero}{i}", "timestamp": str(int(time.time())),
                      "type": "text", "text": {"body": texto}}]}}]}]}


def cliente(numero, tiempos, sin_respuesta):
    time.sleep(random.uniform(0, 2))  # no llegan todos en el mismo milisegundo
    for i, texto in enumerate(MENSAJES):
        antes = len(envios.get(numero, []))
        t0 = time.monotonic()
        receptor.procesar(evento(numero, texto, i))
        nuevos = envios.get(numero, [])[antes:]
        if nuevos:
            tiempos.append(nuevos[0] - t0)
        else:
            sin_respuesta.append((numero, texto))
        time.sleep(random.uniform(1, 3))  # el cliente lee y escribe


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--ejecutar", action="store_true")
    a.add_argument("--limpiar", action="store_true")
    a.add_argument("--clientes", type=int, default=100)
    args = a.parse_args()
    if args.limpiar:
        return limpiar()
    if not args.ejecutar:
        sys.exit(__doc__)

    receptor.enviar = enviar_falso
    receptor.escribiendo = lambda meta_id: None
    receptor.subir_a_meta = lambda *x, **y: "media-falsa"
    numeros = [f"{PREFIJO}{k:05d}" for k in range(args.clientes)]
    tiempos, sin_respuesta = [], []
    print(f"▶ {args.clientes} clientes a la vez, {len(MENSAJES)} mensajes cada uno (sin enviar nada a Meta)…")
    t0 = time.monotonic()
    hilos = [threading.Thread(target=cliente, args=(n, tiempos, sin_respuesta)) for n in numeros]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    total = time.monotonic() - t0

    guardados = db.pedir(f"mensajes?select=lado,leads!inner(telefono)&leads.telefono=like.{PREFIJO}*") or []
    de_clientes = sum(1 for m in guardados if m["lado"] == "cliente")
    esperados = args.clientes * len(MENSAJES)
    t = sorted(tiempos)
    print(f"\n⏱  {total:.0f} s en total")
    if t:
        print(f"   respuesta del bot: mediana {statistics.median(t):.1f} s · 95 % en menos de {t[int(len(t) * .95) - 1]:.1f} s · "
              f"la más lenta {t[-1]:.1f} s")
    print(f"   mensajes de clientes guardados: {de_clientes} de {esperados}"
          + ("" if de_clientes == esperados else "  ✗ FALTAN O SOBRAN"))
    print(f"   mensajes sin respuesta del bot: {len(sin_respuesta)}"
          + (f"  (p. ej. {sin_respuesta[0][1]!r})" if sin_respuesta else ""))
    limpiar()
    ok = de_clientes == esperados and t and t[int(len(t) * .95) - 1] < 15
    print("\n✅ aguanta" if ok else "\n⚠ revisar")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
