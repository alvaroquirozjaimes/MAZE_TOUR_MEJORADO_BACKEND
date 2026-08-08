'use strict';

module.exports = [
  {
    placeName: 'Plaza de Armas de Arequipa',
    hotels: [
      {
        name: 'Hotel Portal Blanco',
        description: 'Alojamiento referencial asociado a la Plaza de Armas de Arequipa, con una propuesta cómoda para viajeros que desean recorrer el centro histórico.',
        images: ['interior-01.webp', 'interior-04.webp'],
        rooms: [
          { name: 'Habitación Matrimonial', type: 'Matrimonial', description: 'Habitación cómoda para dos huéspedes.', price: 160, image: 'interior-01.webp' },
          { name: 'Habitación Doble', type: 'Doble', description: 'Habitación con dos camas para amigos o familiares.', price: 190, image: 'interior-04.webp' },
        ],
      },
    ],
    restaurants: [
      {
        name: 'Patio del Sillar',
        description: 'Restaurante referencial asociado a la Plaza de Armas de Arequipa, con platos peruanos y especialidades regionales.',
        images: ['rest-01.jpg', 'rest-03.jpg'],
        menu: [
          { category: 'specials', name: 'Rocoto relleno', description: 'Especialidad arequipeña acompañada de pastel de papa.', price: 32, image: 'dish-01.jpg' },
          { category: 'dishes', name: 'Lomo saltado', description: 'Carne salteada con cebolla, tomate y papas.', price: 29, image: 'rest-06.avif' },
          { category: 'drinks', name: 'Chicha morada', description: 'Bebida tradicional servida fría.', price: 9, image: 'rest-05.jpg' },
        ],
      },
    ],
  },
  {
    placeName: 'Oasis de Huacachina',
    hotels: [
      {
        name: 'Hotel Dunas del Oasis',
        description: 'Hotel referencial asociado al Oasis de Huacachina, pensado para una estadía de descanso junto al paisaje de dunas.',
        images: ['interior-05.webp', 'interior-06.webp'],
        rooms: [
          { name: 'Habitación Oasis', type: 'Matrimonial', description: 'Habitación para parejas con ambiente cálido.', price: 185, image: 'interior-05.webp' },
          { name: 'Habitación Familiar Dunas', type: 'Familiar', description: 'Opción amplia para familias o grupos pequeños.', price: 260, image: 'interior-06.webp' },
        ],
      },
    ],
    restaurants: [
      {
        name: 'Arena y Sazón',
        description: 'Restaurante referencial asociado a Huacachina, con cocina peruana y opciones ligeras para viajeros.',
        images: ['rest-04.webp', 'rest-05.jpg'],
        menu: [
          { category: 'specials', name: 'Ceviche de la casa', description: 'Pescado fresco con limón, ají y cebolla.', price: 34, image: 'dish-01.jpg' },
          { category: 'dishes', name: 'Arroz con pollo', description: 'Plato clásico peruano con ensalada criolla.', price: 25, image: 'rest-06.avif' },
          { category: 'cocktails', name: 'Pisco sour', description: 'Cóctel clásico peruano.', price: 20, image: 'rest-02.jpeg' },
        ],
      },
    ],
  },
  {
    placeName: 'Machu Picchu',
    hotels: [
      {
        name: 'Hotel Camino Inca',
        description: 'Alojamiento referencial asociado a Machu Picchu, pensado para viajeros que desean descansar antes o después de su recorrido.',
        images: ['interior-03.webp', 'interior-07.webp'],
        rooms: [
          { name: 'Habitación Andina', type: 'Matrimonial', description: 'Habitación cómoda con estilo cálido.', price: 220, image: 'interior-03.webp' },
          { name: 'Habitación Triple Imperial', type: 'Triple', description: 'Habitación de mayor capacidad para grupos pequeños.', price: 310, image: 'interior-07.webp' },
        ],
      },
    ],
    restaurants: [
      {
        name: 'Sabores del Camino',
        description: 'Restaurante referencial asociado a Machu Picchu con una carta breve inspirada en cocina peruana y andina.',
        images: ['rest-03.jpg', 'rest-01.jpg'],
        menu: [
          { category: 'specials', name: 'Trucha andina', description: 'Trucha a la plancha con papas y ensalada.', price: 36, image: 'dish-01.jpg' },
          { category: 'dishes', name: 'Ají de gallina', description: 'Preparación cremosa acompañada de arroz.', price: 27, image: 'rest-06.avif' },
          { category: 'drinks', name: 'Mate de coca frío', description: 'Infusión refrescante servida fría.', price: 8, image: 'rest-05.jpg' },
        ],
      },
    ],
  },
  {
    placeName: 'Laguna de Yarinacocha',
    hotels: [
      {
        name: 'Hotel Laguna Azul',
        description: 'Hotel referencial asociado a la Laguna de Yarinacocha, con una propuesta de descanso para visitantes de Pucallpa.',
        images: ['interior-02.webp', 'interior-05.webp'],
        rooms: [
          { name: 'Habitación Laguna', type: 'Doble', description: 'Habitación para dos huéspedes con ambiente fresco.', price: 150, image: 'interior-02.webp' },
          { name: 'Suite Yarina', type: 'Suite', description: 'Suite amplia para una estadía de descanso.', price: 245, image: 'interior-05.webp' },
        ],
      },
    ],
    restaurants: [
      {
        name: 'Puerto Yarina',
        description: 'Restaurante referencial asociado a Yarinacocha, con opciones inspiradas en sabores amazónicos.',
        images: ['rest-05.jpg', 'rest-02.jpeg'],
        menu: [
          { category: 'specials', name: 'Patarashca', description: 'Pescado sazonado y cocido envuelto en hoja.', price: 31, image: 'dish-01.jpg' },
          { category: 'dishes', name: 'Tacacho con cecina', description: 'Plátano asado con cecina y chorizo.', price: 29, image: 'rest-06.avif' },
          { category: 'drinks', name: 'Aguajina', description: 'Refresco amazónico servido frío.', price: 10, image: 'rest-01.jpg' },
        ],
      },
    ],
  },
  {
    placeName: 'Cueva de las Lechuzas',
    hotels: [
      {
        name: 'Hotel Bosque Verde',
        description: 'Alojamiento referencial asociado a la Cueva de las Lechuzas, pensado para viajeros que recorren los atractivos naturales de Tingo María.',
        images: ['interior-02.webp', 'interior-03.webp'],
        rooms: [
          { name: 'Habitación Bosque', type: 'Matrimonial', description: 'Habitación cómoda para dos huéspedes.', price: 125, image: 'interior-02.webp' },
          { name: 'Habitación Familiar Verde', type: 'Familiar', description: 'Espacio amplio para familias o grupos pequeños.', price: 205, image: 'interior-03.webp' },
        ],
      },
    ],
    restaurants: [
      {
        name: 'Cocina de la Cueva',
        description: 'Restaurante referencial asociado a la Cueva de las Lechuzas, con platos peruanos y sabores de la zona.',
        images: ['rest-02.jpeg', 'rest-04.webp'],
        menu: [
          { category: 'specials', name: 'Juane regional', description: 'Arroz sazonado con gallina envuelto en hoja.', price: 26, image: 'dish-01.jpg' },
          { category: 'dishes', name: 'Pollo a la parrilla', description: 'Pollo acompañado de papas y ensalada.', price: 24, image: 'rest-06.avif' },
          { category: 'drinks', name: 'Refresco de cocona', description: 'Bebida fresca de fruta amazónica.', price: 9, image: 'rest-05.jpg' },
        ],
      },
    ],
  },
];
