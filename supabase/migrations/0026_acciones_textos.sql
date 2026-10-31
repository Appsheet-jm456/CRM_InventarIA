-- 0026 · Textos iniciales de las acciones, probados con el motor de F4·24
--
-- «Pasar a asesor» enviaba un motivo («Te paso con un asesor…») encima del aviso estándar del cuadro asesor, que ya dice lo
-- mismo con el horario: se quita el motivo. «Ubicación del local» suma el singular («dónde queda», «dónde está»).
update public.acciones set hacer = '[{"tipo":"asesor"}]' where sistema and nombre = 'Pasar a asesor';

update public.acciones
   set cuando = '[{"forma":"contiene","texto":"ubicacion"},{"forma":"contiene","texto":"direccion"},{"forma":"contiene","texto":"donde quedan"},{"forma":"contiene","texto":"donde queda"},{"forma":"contiene","texto":"donde estan"},{"forma":"contiene","texto":"donde esta el local"}]'
 where nombre = 'Ubicación del local';
