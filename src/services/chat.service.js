const { Op } = require('sequelize');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { env } = require('../config/env');
const { Place, Hotel, Restaurant, Room, MenuItem, sequelize } = require('../models');

const client = env.geminiApiKey ? new GoogleGenerativeAI(env.geminiApiKey) : null;
const model = client ? client.getGenerativeModel({ model: env.geminiModel }) : null;
const responseCache = new Map();

const withTimeout = (promise, timeoutMs) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Tiempo de espera agotado para la IA.')), timeoutMs)
    ),
  ]);

const cacheGet = (key) => {
  const item = responseCache.get(key);
  if (!item || item.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return item.value;
};
const cacheSet = (key, value) => {
  if (responseCache.size > 250) responseCache.delete(responseCache.keys().next().value);
  responseCache.set(key, { value, expiresAt: Date.now() + 5 * 60_000 });
  return value;
};

const emptyIntent = () => ({
  intention: 'fallback',
  city: null,
  priceRange: null,
  dishName: null,
  category: null,
});

const likesCountLiteral = () =>
  sequelize.literal('(SELECT COUNT(*) FROM "Likes" AS l WHERE l."placeId" = "Place"."id")');

const parsePriceRange = (input) => {
  if (!input) return null;
  const text = String(input).toLowerCase().trim();
  const less = text.match(/(menos de|<)\s*(\d+(?:[.,]\d+)?)/);
  if (less) return { min: 0, max: Number(less[2].replace(',', '.')) };
  const more = text.match(/(más de|mas de|>|\+)\s*(\d+(?:[.,]\d+)?)/);
  if (more) return { min: Number(more[2].replace(',', '.')), max: 999999 };
  const between = text.match(/(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)/);
  if (between) {
    const first = Number(between[1].replace(',', '.'));
    const second = Number(between[2].replace(',', '.'));
    return { min: Math.min(first, second), max: Math.max(first, second) };
  }
  const number = text.match(/\d+(?:[.,]\d+)?/);
  return number ? { min: 0, max: Number(number[0].replace(',', '.')) } : null;
};

const detectIntent = async (message) => {
  if (!model) return emptyIntent();
  const prompt = `Analiza el mensaje y responde únicamente JSON válido con esta estructura:
{"intention":"getHotels|getRestaurants|getPlaces|getPopularPlaces|getRoomsByPrice|fallback","city":null,"priceRange":null,"dishName":null,"category":"hotel|restaurante|lugar|null"}
Mensaje: ${JSON.stringify(message)}`;
  try {
    const result = await withTimeout(model.generateContent(prompt), env.chatTimeoutMs);
    const text = (await result.response).text().replace(/```json|```/gi, '').trim();
    return { ...emptyIntent(), ...JSON.parse(text) };
  } catch (error) {
    console.error('No se pudo interpretar la intención del chat:', error.message);
    return emptyIntent();
  }
};

const answerChat = async (message) => {
  const cacheKey = String(message).trim().toLowerCase();
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const intent = await detectIntent(message);
  const city = intent.city;
  const priceRange = parsePriceRange(intent.priceRange);
  const visibleWhere = { isHidden: false };
  if (city) visibleWhere.city = { [Op.iLike]: `%${city}%` };

  if (['getHotels', 'getRoomsByPrice'].includes(intent.intention)) {
    const places = await Place.findAll({
      where: visibleWhere,
      include: [{
        model: Hotel,
        as: 'hotels',
        required: true,
        include: [{
          model: Room,
          as: 'rooms',
          required: Boolean(priceRange),
          where: priceRange ? { price: { [Op.between]: [priceRange.min, priceRange.max] } } : undefined,
        }],
      }],
      attributes: ['id', 'name', 'shortDescription', 'imageUrl', 'city', 'category', [likesCountLiteral(), 'likesCount']],
      order: [[sequelize.literal('"likesCount"'), 'DESC']],
      limit: 5,
      distinct: true,
    });
    const hotels = places.flatMap((place) => place.hotels || []);
    const response = hotels.length
      ? `🏨 Hoteles${city ? ` en ${city}` : ''}:\n${hotels.map((hotel) => {
          const room = hotel.rooms?.[0];
          return `- **${hotel.name}**${room ? ` — Desde S/. ${room.price}` : ''}`;
        }).join('\n')}`
      : `No encontré hoteles${city ? ` en ${city}` : ''}.`;
    return cacheSet(cacheKey, { message: response, places: [], hotels, restaurants: [] });
  }

  if (intent.intention === 'getRestaurants') {
    const places = await Place.findAll({
      where: visibleWhere,
      include: [{
        model: Restaurant,
        as: 'restaurants',
        required: true,
        include: [{
          model: MenuItem,
          as: 'menuItems',
          required: Boolean(intent.dishName),
          where: intent.dishName ? { dishName: { [Op.iLike]: `%${intent.dishName}%` } } : undefined,
        }],
      }],
      attributes: ['id', 'name', 'shortDescription', 'imageUrl', 'city', 'category', [likesCountLiteral(), 'likesCount']],
      order: [[sequelize.literal('"likesCount"'), 'DESC']],
      limit: 5,
      distinct: true,
    });
    const restaurants = places.flatMap((place) => place.restaurants || []);
    const response = restaurants.length
      ? `🍽 Restaurantes${city ? ` en ${city}` : ''}:\n${restaurants.map((restaurant) => {
          const item = restaurant.menuItems?.[0];
          return `- **${restaurant.name}**${item ? ` — Recomendado: ${item.dishName} (S/. ${item.dishPrice})` : ''}`;
        }).join('\n')}`
      : `No encontré restaurantes${city ? ` en ${city}` : ''}.`;
    return cacheSet(cacheKey, { message: response, places: [], hotels: [], restaurants });
  }

  if (['getPlaces', 'getPopularPlaces'].includes(intent.intention)) {
    const places = await Place.findAll({
      where: visibleWhere,
      attributes: ['id', 'name', 'shortDescription', 'imageUrl', 'city', 'category', [likesCountLiteral(), 'likesCount']],
      order: [[sequelize.literal('"likesCount"'), 'DESC']],
      limit: 5,
    });
    const response = places.length
      ? `🏝 Lugares turísticos${city ? ` en ${city}` : ''}:\n${places.map((place) => `- **${place.name}**: ${place.shortDescription || 'Sin descripción.'}`).join('\n')}`
      : `No encontré lugares turísticos${city ? ` en ${city}` : ''}.`;
    return cacheSet(cacheKey, { message: response, places, hotels: [], restaurants: [] });
  }

  if (model) {
    try {
      const result = await withTimeout(
        model.generateContent(`Responde en máximo dos líneas, de manera amable y sobre turismo en Perú. Mensaje: ${JSON.stringify(message)}`),
        env.chatTimeoutMs
      );
      return cacheSet(cacheKey, { message: (await result.response).text(), places: [], hotels: [], restaurants: [] });
    } catch (error) {
      console.error('No se pudo generar la respuesta del chat:', error.message);
    }
  }

  return cacheSet(cacheKey, {
    message: 'No entendí tu solicitud. Prueba con “hoteles en Cusco” o “restaurantes típicos en Arequipa”.',
    places: [],
    hotels: [],
    restaurants: [],
  });
};

module.exports = { answerChat };
