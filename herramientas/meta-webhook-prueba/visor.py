"""
Visor de PRUEBA de las conversaciones con el número de prueba de Meta, para la demo.

Corre dentro del receptor en OTRO puerto (8096) que el túnel NO expone: solo se ve en la red local, y pide
la clave de lectura de la app (ACCESS_PASSWORD de .env.local) porque muestra teléfonos y mensajes.
Las conversaciones y el estado de cada cliente salen de la Supabase del CRM (tablas leads y mensajes).
"""

import base64
import hmac
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import db
import flujo

PUERTO = 8096


def texto_saliente(mensaje):
    """Lo que ve el cliente, en texto: el cuerpo y las opciones de la lista o los botones."""
    if mensaje.get("type") == "text":
        return mensaje["text"]["body"]
    if mensaje.get("type") == "document":
        return f"📄 {mensaje['document'].get('caption') or mensaje['document'].get('filename', 'Documento')}"
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


def conversaciones():
    salida = []
    for l in db.conversaciones():
        campos = dict((l.get("estado_bot") or {}).get("campos") or {})
        if l.get("valor_estimado") and "Valor estimado" not in campos:
            campos["Valor estimado"] = flujo.cop(float(l["valor_estimado"]))
        salida.append({
            "numero": l["telefono"], "nombre": l["nombre"],
            "mensajes": [{"t": m["creado_en"], "lado": m["lado"], "texto": m["texto"]} for m in l["mensajes"]],
            "estado": {"nodo": l["paso_menu"], "etapa": l["etapa"], "pausa": l["pausar_bot"],
                       "campos": campos, "etiquetas": l.get("etiquetas") or []},
        })
    return salida


PAGINA = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Bandeja · CRM InventarIA</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3/dist/tabler-icons.min.css">
<style>
:root{--bg:#F3F6F3;--surface:#FFFFFF;--surface-2:#EEF2EE;--ink:#17231F;--muted:#5B6A63;--line:#DCE3DD;--side:#14352D;--side-ink:#DCEBE3;--side-muted:#8FB0A2;--side-hover:#1C4439;--side-active:#2E8C6A;--accent:#2E8C6A;--accent-ink:#FFFFFF;--accent-soft:#E0F0E8;--ok:#2E7D4F;--ok-soft:#E3F2E8;--warn:#9A6212;--warn-soft:#FBF0DC;--bad:#B3261E;--bad-soft:#FBE4E2;--cli:#FFFFFF;--bot:#E0F0E8;
--f-display:"Archivo","Arial Narrow",system-ui,sans-serif;--f-body:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--f-mono:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#0F1714;--surface:#16211D;--surface-2:#1C2A25;--ink:#E2EAE5;--muted:#93A69C;--line:#2A3B34;--side:#0A1210;--side-ink:#D6E6DD;--side-muted:#7E9A8D;--side-hover:#15241F;--accent:#4FB08A;--accent-ink:#0B1A14;--accent-soft:#1B3A2E;--ok:#6CC592;--ok-soft:#173327;--warn:#E3AE57;--warn-soft:#3A2C14;--bad:#F08A80;--bad-soft:#3D1D1A;--cli:#1C2A25;--bot:#1B3A2E}}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 var(--f-body)}
button{font:inherit;color:inherit}.mono{font-family:var(--f-mono)}
.app{display:grid;grid-template-columns:auto 1fr;height:100%}
.side{background:var(--side);color:var(--side-ink);width:252px;display:flex;flex-direction:column;transition:width .2s ease;overflow:hidden}
.app.plegado .side{width:68px}
.brand{display:flex;align-items:center;gap:10px;padding:18px 16px 14px;border-bottom:1px solid rgba(255,255,255,.08);min-height:72px}
.logo{flex:none;width:36px;height:36px;border-radius:9px;background:var(--side-active);display:grid;place-items:center;font:800 15px var(--f-display);color:#fff}
.brand-txt{min-width:0}.brand-name{font:700 17px/1.1 var(--f-display);white-space:nowrap}.brand-sub{font-size:11px;color:var(--side-muted);white-space:nowrap}
.nav{flex:1;overflow-y:auto;padding:10px 10px 16px;display:flex;flex-direction:column;gap:2px}
.nav-group{font:600 10.5px var(--f-body);letter-spacing:.9px;text-transform:uppercase;color:var(--side-muted);padding:14px 10px 6px;white-space:nowrap}
.app.plegado .nav-group{visibility:hidden;height:14px;padding:6px 0 0}
.nav a{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:8px;color:var(--side-ink);text-decoration:none;white-space:nowrap;cursor:default}
.nav a:not(.activo){opacity:.72}.nav a.activo{background:var(--side-active);color:#fff;opacity:1}
.nav a i{flex:none;font-size:20px}.nav .paso{margin-left:auto;font:600 10.5px var(--f-mono);color:var(--side-muted)}
.app.plegado .nav a span,.app.plegado .brand-txt,.app.plegado .who{display:none}
.side-foot{border-top:1px solid rgba(255,255,255,.08);padding:12px 16px;display:flex;align-items:center;gap:10px}
.avatar{flex:none;width:32px;height:32px;border-radius:50%;background:#2A5A4B;display:grid;place-items:center;font:600 12px var(--f-body);color:#fff}
.who{font-size:12.5px;line-height:1.3;min-width:0}.who b{display:block;font-weight:500}.who small{color:var(--side-muted)}
.main{display:flex;flex-direction:column;min-width:0;height:100%}
.top{display:flex;align-items:center;gap:12px;padding:12px 24px;background:var(--surface);border-bottom:1px solid var(--line)}
.iconbtn{border:1px solid var(--line);background:var(--surface);width:36px;height:36px;border-radius:8px;display:grid;place-items:center;cursor:pointer}
.iconbtn:hover{background:var(--surface-2)}.iconbtn i{font-size:18px}
.crumb small{display:block;font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)}
.crumb h1{margin:0;font:700 20px/1.2 var(--f-display)}
.vivo{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.vivo:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--ok)}
.content{flex:1;min-height:0;padding:18px 24px;display:flex;flex-direction:column;gap:12px}
.aviso{font-size:12.5px;padding:8px 12px;border-radius:8px;background:var(--accent-soft);color:var(--accent)}
.bandeja{flex:1;min-height:0;display:grid;grid-template-columns:290px minmax(0,1fr) 290px;background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.col{min-height:0;display:flex;flex-direction:column}.col+.col{border-left:1px solid var(--line)}
.col-h{padding:12px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;min-height:58px}
.col-h h2{margin:0;font:600 15px var(--f-display)}.col-h small{color:var(--muted);font-size:12px}
.lista{overflow-y:auto;flex:1}
.conv{padding:11px 16px;border-bottom:1px solid var(--line);cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:2px 10px;align-items:center}
.conv:hover{background:var(--surface-2)}.conv.on{background:var(--accent-soft)}
.conv .avatar{grid-row:span 2;background:var(--accent)}.conv b{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.conv time{font:12px var(--f-mono);color:var(--muted)}
.conv small{grid-column:2/4;color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chat{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:8px;background:var(--bg)}
.m{max-width:72%;padding:8px 11px;border-radius:10px;font-size:13.5px;line-height:1.45;white-space:pre-wrap;border:1px solid var(--line)}
.m.cliente{align-self:flex-start;background:var(--cli);border-top-left-radius:3px}
.m.bot{align-self:flex-end;background:var(--bot);border-top-right-radius:3px}
.m time{display:block;font:11px var(--f-mono);color:var(--muted);text-align:right;margin-top:3px}
.m .opts{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.m .opts span{font-size:12px;padding:3px 9px;border-radius:20px;background:var(--surface);border:1px solid var(--line);color:var(--accent)}
.chip{display:inline-block;font:600 11px var(--f-body);letter-spacing:.3px;padding:2px 9px;border-radius:20px;white-space:nowrap}
.chip.ok{background:var(--ok-soft);color:var(--ok)}.chip.warn{background:var(--warn-soft);color:var(--warn)}.chip.acc{background:var(--accent-soft);color:var(--accent)}.chip.neu{background:var(--surface-2);color:var(--muted)}
.ficha{overflow-y:auto;flex:1;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.dato small{display:block;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--muted)}
.dato div{font-weight:500}
.embudo{display:flex;flex-direction:column;gap:4px}
.paso-e{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
.paso-e i{font-size:16px}.paso-e.hecho{color:var(--ok)}.paso-e.actual{color:var(--accent);font-weight:600}
.vacio{margin:auto;color:var(--muted);text-align:center;font-size:13px}
@media (max-width:1100px){.bandeja{grid-template-columns:240px minmax(0,1fr)}.bandeja .col:nth-child(3){display:none}}
@media (max-width:760px){.app{grid-template-columns:1fr}.side{display:none}.bandeja{grid-template-columns:1fr}.bandeja .col:first-child{display:none}.content{padding:12px}}
</style></head><body>
<div class="app" id="app">
<aside class="side" aria-label="Módulos">
<div class="brand"><div class="logo">VV</div><div class="brand-txt"><div class="brand-name">CRM InventarIA</div><div class="brand-sub">Ventas Virtuales Colombia</div></div></div>
<nav class="nav">
<a title="Inicio"><i class="ti ti-home"></i><span>Inicio</span><span class="paso">F3·8</span></a>
<div class="nav-group">Atención</div>
<a class="activo" title="Bandeja"><i class="ti ti-inbox"></i><span>Bandeja</span></a>
<a title="Embudo"><i class="ti ti-layout-kanban"></i><span>Embudo</span><span class="paso">F3·5</span></a>
<a title="Seguimientos"><i class="ti ti-bell-ringing"></i><span>Seguimientos</span><span class="paso">F3·6</span></a>
<div class="nav-group">Ventas</div>
<a title="Inventario"><i class="ti ti-device-laptop"></i><span>Inventario</span><span class="paso">F3·9</span></a>
<a title="Chat InventarIA"><i class="ti ti-message-chatbot"></i><span>Chat InventarIA</span><span class="paso">F3·9</span></a>
<div class="nav-group">Análisis</div>
<a title="Métricas"><i class="ti ti-chart-bar"></i><span>Métricas</span><span class="paso">F3·8</span></a>
<div class="nav-group">Configuración</div>
<a title="Bot y horario"><i class="ti ti-sitemap"></i><span>Bot y horario</span><span class="paso">F3·7</span></a>
<a title="Etapas"><i class="ti ti-list-numbers"></i><span>Etapas</span><span class="paso">F3·5</span></a>
<a title="Respuestas rápidas"><i class="ti ti-bolt"></i><span>Respuestas rápidas</span><span class="paso">F3·5</span></a>
<a title="Usuarios y roles"><i class="ti ti-users"></i><span>Usuarios y roles</span><span class="paso">F3·1</span></a>
<a title="Canal WhatsApp"><i class="ti ti-brand-whatsapp"></i><span>Canal WhatsApp</span><span class="paso">F3·3</span></a>
</nav>
<div class="side-foot"><div class="avatar">JM</div><div class="who"><b>Demo</b><small>Número de prueba de Meta</small></div></div>
</aside>
<div class="main">
<header class="top">
<button class="iconbtn" id="plegar" aria-label="Abrir o cerrar el panel"><i class="ti ti-layout-sidebar"></i></button>
<div class="crumb"><small>Atención</small><h1>Bandeja</h1></div>
<div class="vivo">En vivo · API oficial de Meta</div>
</header>
<main class="content">
<div class="aviso"><b>Adelanto de la app nueva.</b> La Bandeja muestra en vivo las conversaciones con el número de prueba; los demás módulos se construyen en la Fase 3 (el paso sale al lado de cada uno).</div>
<section class="bandeja">
<div class="col"><div class="col-h"><h2>Conversaciones</h2><small id="n"></small></div><div class="lista" id="lista"></div></div>
<div class="col"><div class="col-h" id="chat-h"><small>Elige una conversación</small></div><div class="chat" id="chat"><p class="vacio">Esperando mensajes al número de prueba…</p></div></div>
<div class="col"><div class="col-h"><h2>Datos del cliente</h2></div><div class="ficha" id="ficha"></div></div>
</section>
</main>
</div>
</div>
<script>
const app=document.getElementById("app");
try{if(localStorage.getItem("crm-plegado")==="1")app.classList.add("plegado")}catch(e){}
document.getElementById("plegar").onclick=()=>{app.classList.toggle("plegado");try{localStorage.setItem("crm-plegado",app.classList.contains("plegado")?"1":"0")}catch(e){}};
const ETAPAS=["Nuevo","En Conversación","Cotización","Negociación","Confirmar transfer","Vendido"];
let sel=null,firma="";
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const ini=s=>(s||"?").split(/\\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join("").toUpperCase();
const hora=t=>new Date(t).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"America/Bogota"});
function burbuja(m){let t=m.texto,opts="";const k=t.lastIndexOf("\\n\\n[");
  if(m.lado==="bot"&&k>=0&&t.endsWith("]")){const d=t.slice(k+3,-1).replace(/^\\s+|\\s+$/g,"");const p=d.includes(": ")?d.split(": ").slice(1).join(": "):d;
    opts='<div class="opts">'+p.split(" · ").map(o=>`<span>${esc(o)}</span>`).join("")+"</div>";t=t.slice(0,k)}
  return `<div class="m ${m.lado}">${esc(t)}${opts}<time>${hora(m.t)}</time></div>`}
function chipBot(e){return !e?'<span class="chip neu">Sin estado</span>':e.pausa?'<span class="chip warn">En cola de asesor</span>':'<span class="chip ok">Bot activo</span>'}
async function cargar(){let r;try{r=await fetch("api/conversaciones")}catch(e){return}if(!r.ok)return;
  const chats=await r.json();const f=JSON.stringify(chats)+sel;if(f===firma)return;firma=f;
  document.getElementById("n").textContent=chats.length?chats.length+" activas":"";
  if(!chats.length)return;if(!sel||!chats.find(c=>c.numero===sel))sel=chats[0].numero;
  document.getElementById("lista").innerHTML=chats.map(c=>{const u=c.mensajes[c.mensajes.length-1];
    return `<div class="conv ${c.numero===sel?"on":""}" data-n="${c.numero}"><div class="avatar">${esc(ini(c.nombre))}</div><b>${esc(c.nombre||c.numero)}</b><time>${hora(u.t)}</time><small>${u.lado==="bot"?"Bot: ":""}${esc(u.texto.split("\\n")[0])}</small></div>`}).join("");
  document.querySelectorAll(".conv").forEach(d=>d.onclick=()=>{sel=d.dataset.n;firma="";cargar()});
  const c=chats.find(x=>x.numero===sel),e=c.estado;
  document.getElementById("chat-h").innerHTML=`<div class="avatar" style="background:var(--accent)">${esc(ini(c.nombre))}</div><div style="min-width:0"><h2>${esc(c.nombre||"Cliente")}</h2><small class="mono">+${c.numero}</small></div><div style="margin-left:auto">${chipBot(e)}</div>`;
  const chat=document.getElementById("chat");chat.innerHTML=c.mensajes.map(burbuja).join("");chat.scrollTop=chat.scrollHeight;
  let h="";
  if(e){const i=ETAPAS.indexOf(e.etapa);
    h+=`<div class="dato"><small>Etapa del embudo</small><div class="embudo">${ETAPAS.slice(0,4).map((s,j)=>`<div class="paso-e ${j<i?"hecho":j===i?"actual":""}"><i class="ti ${j<i?"ti-circle-check":j===i?"ti-circle-dot":"ti-circle"}"></i>${s}</div>`).join("")}</div></div>`;
    const cam=e.campos,orden=["Búsqueda","Categoría interés","Uso equipo","Presupuesto","Marca interés","Código producto","Valor estimado"];
    for(const k of orden)if(cam[k])h+=`<div class="dato"><small>${esc(k)}</small><div class="${k.includes("Código")||k.includes("Valor")?"mono":""}">${esc(cam[k])}</div></div>`;
    const et=(e.etiquetas&&e.etiquetas.length)?e.etiquetas:(cam["Etiqueta"]?[cam["Etiqueta"]]:[]);
    if(et.length)h+=`<div class="dato"><small>Etiquetas</small><div style="display:flex;flex-wrap:wrap;gap:4px">${et.map(x=>`<span class="chip acc">${esc(x)}</span>`).join("")}</div></div>`;
    h+=`<div class="dato"><small>Paso del bot</small><div class="mono">${esc(e.nodo||"—")}</div></div>`;
    if(cam["Errores bot"])h+=`<div class="dato"><small>Respuestas no entendidas</small><div>${esc(cam["Errores bot"])}</div></div>`;
  }else h='<p class="vacio">El receptor se reinició: el estado de esta conversación empieza con su próximo mensaje.</p>';
  document.getElementById("ficha").innerHTML=h}
cargar();setInterval(cargar,2000);
</script></body></html>
"""


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
