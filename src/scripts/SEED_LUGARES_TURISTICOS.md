# Carga inicial de lugares turísticos de Maze Tour Perú

Este seed carga únicamente lugares turísticos. No crea hoteles, restaurantes ni marcadores del mapa.

## Ejecutar

Desde la carpeta `backend`:

```bash
node src/scripts/seedTouristPlaces.js
```

El script:

- aplica las migraciones pendientes antes de cargar;
- crea únicamente los destinos que hagan falta para estos lugares;
- copia las imágenes optimizadas a `storage/uploads`;
- crea los registros en `Places` con `category = lugar`;
- deja `showOnMap = false` para que la ubicación se asigne después desde el módulo Mapas;
- no duplica lugares si se vuelve a ejecutar;
- deja el precio inicial en `0.00` para no inventar tarifas que pueden cambiar.

## Lugares que se excluyen a propósito

- `RESTAURANTE`: se cargará en otra etapa.
- `HUÁNUCO/MICRUSTACEO`: corresponde a un restaurante, no a un lugar turístico.
- imágenes sueltas de las carpetas principales de ciudades: se consideran material general de destino, no registros individuales de lugares.

## Correcciones de clasificación aplicadas

- Oasis de Huacachina -> Ica / Ica.
- Bodega El Catador -> Ica / Ica.
- Río Hirviente de Mayantuyacu -> Huánuco / Honoria.
