Reemplaza en tu backend:
- src/data/demoCatalog.seed.js
- src/scripts/seedDemoHotelsRestaurants.js
- carpeta src/seed-assets/demo-catalog/restaurants/
- carpeta src/seed-assets/demo-catalog/interiors/
- carpeta src/seed-assets/demo-catalog/full-days/

Luego ejecuta:
node src/scripts/seedDemoHotelsRestaurants.js

Qué hace ahora:
- agrega / actualiza hoteles referenciales
- agrega / actualiza restaurantes referenciales
- agrega / actualiza full days referenciales
- ya no usa el texto "Demo" en los nombres
- añade coordenadas separadas y showOnMap = true
- crea platos/bebidas de ejemplo con imagen en restaurantes si aún no tienen menú cargado
- preserva la carta PDF y los platos que tú agregues después
