"""
Pruebas de los botones de la ficha con los interruptores (arreglo del 1 nov 2026): «Lo quiero» abre la compra, y con el Menú guiado
apagado los botones ya enviados, la media y «reiniciar» siguen funcionando. Sin base ni WhatsApp. Uso:
python3 herramientas/meta-webhook-prueba/prueba_botones.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import receptor, db, flujo, acciones, compra, agente
ENV=[]
LEAD={"id":1,"telefono":"573002103979","nombre":"","paso_menu":"R11","etapa":"Cotización","errores_bot":0,"pausar_bot":False,"bot_id":None,
      "estado_bot":{"campos":{"Código producto":"100-102-1069","Valor estimado":"$800.000"}},"etiquetas":[],"atributos":{},"categoria_interes":"","uso_equipo":"","presupuesto":"","marca_interes":"","cotiz_producto":"100-102-1069"}
C={"R11":{"clave":"R11","tipo":"ficha","nombre":"ficha","inicio":False,"texto":"x","opciones":[{"id":"1","titulo":"Lo quiero","destino":"B-ASESOR","reconocer":"quiere_comprar"},{"id":"2","titulo":"Ver otro código","destino":"@pedir_codigo"},{"id":"0","titulo":"Menú principal","destino":"B00"}],"salidas":{},"ajustes":{},"al_entrar":{},"marcas":[]},
   "B00":{"clave":"B00","tipo":"mensaje","nombre":"B00","inicio":True,"texto":"Hola","opciones":[{"id":"1","titulo":"A","destino":"B-ASESOR"}],"salidas":{},"ajustes":{},"al_entrar":{},"marcas":[]},
   "B-CERRADO":{"clave":"B-CERRADO","tipo":"aviso","nombre":"x","inicio":False,"texto":"Fuera de horario, un asesor te responde","opciones":[],"salidas":{},"ajustes":{},"al_entrar":{},"marcas":[]},
   "B-ASESOR":{"clave":"B-ASESOR","tipo":"asesor","nombre":"x","inicio":False,"texto":"Un asesor te atiende","opciones":[],"salidas":{},"ajustes":{},"al_entrar":{},"marcas":[]}}
INV=[{"cod":"100-102-1069","marca":"DELL","modelo":"5490","cpu":"i5","gen":8,"ram":"8GB","disco":"256GB","estado":"Usado","precio":800000,"stock":1,"foto":None}]
I={"chatbot_activo":True,"menu_activo":True,"agente_en_todo":True,"texto_apagado":""}
ACC=[{"id":4,"nombre":"Quiero comprar","prioridad":20,"activa":True,"cuando":[{"forma":"contiene","texto":"quiero comprar"},{"forma":"contiene","texto":"lo quiero"},{"forma":"contiene","texto":"lo compro"}],"hacer":[{"tipo":"flujo","flujo":"compra"}]}]
db.lead=lambda t: dict(LEAD); db.crear_lead=lambda t,n: dict(LEAD); db.guardar_mensaje=lambda *a,**k: None; db.actualizar_lead=lambda i,c: None
db.bot_config=lambda: I; db.flujo=lambda bot=None: C; db.principal=lambda: 1; db.atributos=lambda: {}
db.agente_config=lambda fresco=False: {"estado":"todos","buffer_segundos":0,"escribiendo":False,"espera_primera_ms":0,"pausa_mensajes_ms":0,"texto_cuentas":"Cuentas","cargo_configuracion":80000}
db.acciones_activas=lambda: [a for a in ACC if a['activa']]; db.compra_mover=lambda *a,**k: None; db.agregar_nota=lambda *a,**k: ""
flujo.inventario=lambda: INV; flujo.texto_horario=lambda: "L-V"
receptor.enviar=lambda n,m: (ENV.append(m) or "enviado"); receptor.anotar=lambda *a: None; receptor.resolver=lambda m: m
texto=lambda m: m.get("text",{}).get("body") or m.get("interactive",{}).get("body",{}).get("text","")
G = {}
db.actualizar_lead = lambda i, c: G.update(c)
fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def turno(entrada, tipo="interactive", **lead):
    ENV.clear()
    G.clear()
    LEAD.update({"paso_menu": "R11", "pausar_bot": False, **lead})
    receptor._contestar("573002103979", entrada, entrada, "", tipo, "wamid.1")
    return [texto(m) for m in ENV]


for menu in (True, False):
    I["menu_activo"] = menu
    t = turno("1")
    ok(t and t[0].startswith("¿Compras como") and G.get("paso_menu") == "COMPRA" and not G.get("pausar_bot"),
       f"menú {'encendido' if menu else 'apagado'}: el botón «Lo quiero» de la ficha abre la compra")

I["menu_activo"] = True
ACC[0]["activa"] = False
t = turno("1")
ok(G.get("pausar_bot") and G.get("paso_menu") == "B-ASESOR", "con la acción «Quiero comprar» apagada, «Lo quiero» pasa al asesor como antes")
ACC[0]["activa"] = True

I["menu_activo"] = False
t = turno("0")
ok(t == ["Hola\n\n1️⃣ A"] or (t and t[0].startswith("Hola")), "menú apagado: «Menú principal» de la ficha lo sigue atendiendo el motor")
t = turno("reiniciar", tipo="text", pausar_bot=True)
ok(G.get("pausar_bot") is False and t, "menú apagado: «reiniciar» quita la pausa y empieza de nuevo")
I["menu_activo"] = True

print(f"\n{n - fallos} de {n} pruebas bien")
sys.exit(1 if fallos else 0)
