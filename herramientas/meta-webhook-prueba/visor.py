"""
Visor de PRUEBA de las conversaciones con el número de prueba de Meta, para la demo.

Corre dentro del receptor en OTRO puerto (8096) que el túnel NO expone: solo se ve en la red local, y pide
la clave de lectura de la app (ACCESS_PASSWORD de .env.local) porque muestra teléfonos y mensajes.
Las conversaciones se guardan en conversaciones.jsonl (fuera de git: datos personales).
"""

import base64
import hmac
import json
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import flujo

ARCHIVO = Path(__file__).with_name("conversaciones.jsonl")
PUERTO = 8096
_candado = threading.Lock()


def texto_saliente(mensaje):
    """Lo que ve el cliente, en texto: el cuerpo y las opciones de la lista o los botones."""
    if mensaje.get("type") == "text":
        return mensaje["text"]["body"]
    i = mensaje.get("interactive", {})
    cuerpo = i.get("body", {}).get("text", "")
    accion = i.get("action", {})
    if i.get("type") == "button":
        botones = " · ".join(b["reply"]["title"] for b in accion.get("buttons", []))
        return f"{cuerpo}\n\n[ {botones} ]"
    if i.get("type") == "list":
        filas = [f["title"] for s in accion.get("sections", []) for f in s.get("rows", [])]
        return f"{cuerpo}\n\n[{accion.get('button', 'Opciones')}: {' · '.join(filas)}]"
    return f"[{mensaje.get('type')}]"


def registrar(numero, nombre, lado, texto):
    linea = {"t": datetime.now().isoformat(timespec="seconds"), "numero": numero,
             "nombre": nombre, "lado": lado, "texto": texto}
    with _candado, ARCHIVO.open("a", encoding="utf-8") as f:
        f.write(json.dumps(linea, ensure_ascii=False) + "\n")


def conversaciones():
    chats = {}
    if ARCHIVO.exists():
        for linea in ARCHIVO.read_text(encoding="utf-8").splitlines():
            try:
                m = json.loads(linea)
            except json.JSONDecodeError:
                continue
            c = chats.setdefault(m["numero"], {"numero": m["numero"], "nombre": "", "mensajes": []})
            c["nombre"] = m.get("nombre") or c["nombre"]
            c["mensajes"].append({k: m[k] for k in ("t", "lado", "texto")})
    for numero, c in chats.items():
        st = flujo.estados.get(numero)
        c["estado"] = {"nodo": st["nodo"], "etapa": st["etapa"], "pausa": st["pausa"],
                       "campos": st["campos"]} if st else None
    return sorted(chats.values(), key=lambda c: c["mensajes"][-1]["t"], reverse=True)


PAGINA = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Conversaciones · número de prueba</title>
<style>
:root{--f:#f0f2f5;--c:#fff;--t:#1f1f1d;--s:#5f5e5a;--b:rgba(0,0,0,.12);--yo:#d9fdd3;--ac:#0f766e}
@media (prefers-color-scheme:dark){:root{--f:#111b21;--c:#202c33;--t:#e9edef;--s:#8696a0;--b:rgba(255,255,255,.12);--yo:#005c4b;--ac:#2dd4bf}}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--f);color:var(--t)}
header{padding:12px 16px;border-bottom:.5px solid var(--b);background:var(--c);display:flex;gap:10px;align-items:baseline}
header b{font-size:16px}header small{color:var(--s)}
main{display:grid;grid-template-columns:260px minmax(0,1fr) 260px;height:calc(100vh - 49px)}
@media (max-width:900px){main{grid-template-columns:minmax(0,1fr)}#lista,#ficha{display:none}}
#lista,#ficha{background:var(--c);overflow-y:auto;border-right:.5px solid var(--b)}#ficha{border-left:.5px solid var(--b);border-right:0;padding:12px 14px;font-size:13px}
.item{padding:10px 14px;border-bottom:.5px solid var(--b);cursor:pointer}.item.on{background:var(--f)}
.item b{display:block;font-size:14px}.item small{color:var(--s);font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#chat{overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:6px}
.m{max-width:70%;padding:7px 10px;border-radius:8px;font-size:14px;line-height:1.45;white-space:pre-wrap;background:var(--c);align-self:flex-end;border:.5px solid var(--b)}
.m.cliente{background:var(--yo);align-self:flex-start}.m time{display:block;font-size:11px;color:var(--s);text-align:right;margin-top:2px}
.k{color:var(--s);margin-top:10px}.v{font-weight:500}.pausa{color:#b45309}.vacio{color:var(--s);margin:auto}
</style></head><body>
<header><b>Conversaciones</b><small>número de prueba de Meta · se actualiza solo · bot a la derecha, cliente a la izquierda</small></header>
<main><div id="lista"></div><div id="chat"><p class="vacio">Esperando mensajes al número de prueba…</p></div><div id="ficha"></div></main>
<script>
let sel=null,firma="";
const esc=s=>String(s??"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const hora=t=>t.slice(11,16);
async function cargar(){
  let r;try{r=await fetch("api/conversaciones");}catch(e){return}
  if(!r.ok)return;const chats=await r.json();const f=JSON.stringify(chats);if(f===firma)return;firma=f;
  if(!chats.length)return;if(!sel||!chats.find(c=>c.numero===sel))sel=chats[0].numero;
  document.getElementById("lista").innerHTML=chats.map(c=>{const u=c.mensajes[c.mensajes.length-1];
    return `<div class="item ${c.numero===sel?"on":""}" onclick="sel='${c.numero}';firma='';cargar()"><b>${esc(c.nombre||c.numero)}</b><small>${esc(u.texto.split("\\n")[0])}</small></div>`}).join("");
  const c=chats.find(x=>x.numero===sel),chat=document.getElementById("chat");
  chat.innerHTML=c.mensajes.map(m=>`<div class="m ${m.lado}">${esc(m.texto)}<time>${hora(m.t)}</time></div>`).join("");
  chat.scrollTop=chat.scrollHeight;
  const e=c.estado;document.getElementById("ficha").innerHTML=`<b style="font-size:15px">${esc(c.nombre||"Cliente")}</b><div style="color:var(--s)">${c.numero}</div>`+
   (e?`<div class="k">Etapa del embudo</div><div class="v">${esc(e.etapa||"—")}</div><div class="k">Nodo del árbol</div><div class="v">${esc(e.nodo||"—")}</div>
   <div class="k">Bot</div><div class="v ${e.pausa?"pausa":""}">${e.pausa?"Pausado · en cola de asesor":"Activo"}</div>
   <div class="k">Datos guardados</div>${Object.entries(e.campos).map(([k,v])=>`<div>${esc(k)}: <span class="v">${esc(v)}</span></div>`).join("")||"—"}`
   :`<div class="k">Sin estado en memoria (el receptor se reinició)</div>`);
}
cargar();setInterval(cargar,2000);
</script></body></html>"""


def _clave():
    return flujo._env_local().get("ACCESS_PASSWORD", "")


class Visor(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _autorizado(self):
        cabecera = self.headers.get("Authorization", "")
        if cabecera.startswith("Basic "):
            try:
                _, _, clave = base64.b64decode(cabecera[6:]).decode().partition(":")
                return bool(_clave()) and hmac.compare_digest(clave, _clave())
            except Exception:
                return False
        return False

    def do_GET(self):
        if not self._autorizado():
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="CRM InventarIA - clave de lectura"')
            self.end_headers()
            return
        if self.path.rstrip("/") in ("", "/chat"):
            cuerpo, tipo = PAGINA.encode(), "text/html; charset=utf-8"
        elif self.path.endswith("api/conversaciones"):
            cuerpo, tipo = json.dumps(conversaciones(), ensure_ascii=False).encode(), "application/json"
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)


def arrancar():
    servidor = ThreadingHTTPServer(("0.0.0.0", PUERTO), Visor)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    return PUERTO
