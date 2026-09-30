-- 0013 · Posiciones iniciales del lienzo (F4·6)
--
-- La versión 1 nació en una sola fila de 2.600 px: al encuadrar todo, los cuadros no se leían. Tres filas: el camino
-- de compra arriba y de vuelta abajo, y los avisos sueltos al final. Solo mueve cuadros; el flujo no cambia.
update public.bot_cuadros k set x = p.x, y = p.y
from public.bot_flujos f,
     (values ('B00', 0, 0), ('B001A', 300, 0), ('B001A1', 600, 0), ('B001A2', 900, 0), ('B001A3', 1200, 0),
             ('B001A4', 1200, 400), ('B001A5', 900, 400), ('R11', 600, 400), ('B-ASESOR', 300, 400),
             ('B-CERRADO', 0, 760), ('ERROR', 300, 760), ('ERROR-3', 600, 760)) as p (clave, x, y)
where f.id = k.flujo_id and f.estado = 'publicada' and k.clave = p.clave;
