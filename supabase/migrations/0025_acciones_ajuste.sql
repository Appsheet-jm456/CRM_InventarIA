-- 0025 · Ajuste de la acción «Pasar a asesor» antes de encender el motor de acciones (F4·24)
--
-- «una persona» se disparaba con frases como «el equipo es para una persona que diseña». Se cambia por frases que sí piden
-- hablar con alguien. El administrador puede editarlas desde Configuración → Agente → Acciones.
update public.acciones
   set cuando = '[{"forma":"contiene","texto":"asesor"},{"forma":"contiene","texto":"humano"},{"forma":"contiene","texto":"hablar con alguien"},{"forma":"contiene","texto":"hablar con una persona"}]'
 where sistema and nombre = 'Pasar a asesor';
