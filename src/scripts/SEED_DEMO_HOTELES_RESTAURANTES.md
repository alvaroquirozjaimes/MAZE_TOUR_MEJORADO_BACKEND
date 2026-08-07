# Carga de ejemplos: hoteles y restaurantes

Ejecutar desde la raíz del backend:

```bash
node src/scripts/seedDemoHotelsRestaurants.js
```

Incluye:
- 4 hoteles DEMO.
- 2 habitaciones de ejemplo por hotel en la primera carga.
- 4 restaurantes DEMO.
- Imágenes de ejemplo tomadas del paquete de imágenes proporcionado para Maze Tour.
- Restaurantes sin carta PDF para que puedas cargarla después desde el formulario.
- `showOnMap=false` para todos los negocios DEMO, evitando mostrar una ubicación ficticia.

El script es seguro para volver a ejecutar:
- no duplica los registros DEMO;
- si ya agregaste habitaciones a un hotel DEMO, las conserva;
- si ya cargaste carta o platos a un restaurante DEMO, los conserva.
