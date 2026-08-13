const crypto = require('crypto');
const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const { env } = require('../config/env');
const { AppError } = require('../utils/app-error');

const fieldDirectories = {
  mainImage: 'mainImages',
  gallery: 'gallery',
  hotelImages: 'hotelImages',
  roomImages: 'roomImages',
  restaurantImages: 'restaurantImages',
  menuItemImages: 'menuItemImages',
  restaurantMenuPdf: 'restaurantPdfs',
  restaurantMenuPdfs: 'restaurantPdfs',
  images: 'fullDays',
  regionImage: 'regions',
  destinationImage: 'destinations',
};

const pdfFields = new Set(['restaurantMenuPdf', 'restaurantMenuPdfs']);
const supportedImageTypes = new Set(['jpeg', 'png', 'webp', 'heic', 'heif']);

/*
 * Los iPhone suelen guardar las fotos como HEIC/HEIF. No confiamos en la
 * extensión ni en el MIME enviado por el navegador: detectamos el formato
 * real leyendo la cabecera del archivo.
 */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const HEIF_BRANDS = new Set(['mif1', 'msf1']);

const storage = multer.diskStorage({
  destination(_req, file, callback) {
    const directory = fieldDirectories[file.fieldname] || 'others';
    const destination = path.join(env.uploadRoot, directory);
    fsSync.mkdirSync(destination, { recursive: true });
    callback(null, destination);
  },
  filename(_req, file, callback) {
    const extension = pdfFields.has(file.fieldname) ? '.pdf' : '.upload';
    callback(null, `${file.fieldname}-${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const rawUpload = multer({
  storage,
  limits: {
    /* El límite previo estaba atado al PDF. Ahora respeta el mayor límite
       permitido para que una foto HEIC de iPhone no sea rechazada por Multer
       antes de que podamos optimizarla. */
    fileSize: Math.max(env.maxImageBytes, env.maxPdfBytes),
    files: 80,
    fields: 200,
    fieldSize: 2 * 1024 * 1024,
  },
}).fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'gallery', maxCount: 10 },
  { name: 'hotelImages', maxCount: 16 },
  { name: 'roomImages', maxCount: 30 },
  { name: 'restaurantImages', maxCount: 16 },
  { name: 'menuItemImages', maxCount: 30 },
  { name: 'restaurantMenuPdf', maxCount: 6 },
  { name: 'restaurantMenuPdfs', maxCount: 6 },
  { name: 'images', maxCount: 1 },
  { name: 'regionImage', maxCount: 1 },
  { name: 'destinationImage', maxCount: 1 },
]);

const allFiles = (req) => Object.values(req.files || {}).flat();

const removePhysicalFiles = async (files) => {
  await Promise.all(
    files.map(async (file) => {
      if (!file?.path) return;
      try {
        await fs.unlink(file.path);
      } catch (error) {
        if (error.code !== 'ENOENT') console.error('No se pudo limpiar un archivo:', error.message);
      }
    })
  );
};

const detectFileType = async (filePath) => {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(128);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead);

    if (head.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
    if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';

    // HEIF/HEIC usa un contenedor ISO-BMFF: [size][ftyp][major brand]...
    if (head.length >= 12 && head.subarray(4, 8).toString('ascii') === 'ftyp') {
      const brands = [];
      for (let offset = 8; offset + 4 <= head.length; offset += 4) {
        brands.push(head.subarray(offset, offset + 4).toString('ascii').toLowerCase());
      }
      if (brands.some((brand) => HEIC_BRANDS.has(brand))) return 'heic';
      if (brands.some((brand) => HEIF_BRANDS.has(brand))) return 'heif';
    }

    return 'unknown';
  } finally {
    await handle.close();
  }
};

let heicDecodeModule;
const getHeicDecode = () => {
  if (heicDecodeModule) return heicDecodeModule;
  try {
    /*
     * HEIC/HEIF no se pasa a Sharp directamente. Los binarios habituales de
     * Sharp pueden reconocer el contenedor HEIF pero no necesariamente tienen
     * el códec HEVC necesario para decodificar los píxeles.
     *
     * heic-decode usa libheif en JavaScript/WASM y nos entrega los píxeles
     * RGBA. De ahí pasamos esos píxeles crudos a Sharp para generar UNA sola
     * compresión final WebP, evitando el puente HEIC -> JPEG -> WebP y su
     * pérdida de calidad adicional.
     *
     * Instalar en backend: npm install heic-decode
     */
    heicDecodeModule = require('heic-decode');
    return heicDecodeModule;
  } catch (_error) {
    throw new AppError(
      'El servidor reconoce la foto HEIC/HEIF, pero falta instalar el decodificador. Ejecuta "npm install heic-decode" en el backend.',
      500
    );
  }
};

const heicToSharpPipeline = async (filePath) => {
  const decode = getHeicDecode();
  const inputBuffer = await fs.readFile(filePath);

  try {
    const decoded = await decode({ buffer: inputBuffer });
    const width = Number(decoded?.width || 0);
    const height = Number(decoded?.height || 0);
    const data = decoded?.data;

    if (!width || !height || !data?.byteLength) {
      throw new Error('HEIC decodificado sin dimensiones o sin datos de píxeles.');
    }

    const expectedBytes = width * height * 4;
    if (data.byteLength < expectedBytes) {
      throw new Error(`HEIC incompleto: ${data.byteLength} bytes; se esperaban ${expectedBytes}.`);
    }

    /* Buffer.from(ArrayBuffer, offset, length) evita una copia adicional de
       una foto de 12/24/48 MP. El resultado de heic-decode tiene 4 canales
       RGBA, formato que Sharp acepta como entrada raw. */
    const pixelBuffer = Buffer.from(data.buffer, data.byteOffset, expectedBytes);

    return sharp(pixelBuffer, {
      raw: {
        width,
        height,
        channels: 4,
      },
      failOn: 'error',
      limitInputPixels: 45_000_000,
    });
  } catch (error) {
    console.error('No se pudo decodificar HEIC/HEIF:', error?.message || error);
    throw new AppError(
      'No se pudo procesar esta foto HEIC/HEIF. Prueba con otra foto o expórtala nuevamente desde el iPhone.',
      400
    );
  }
};

const createSharpPipeline = async (file, actualType) => {
  const sharpOptions = { failOn: 'error', limitInputPixels: 45_000_000 };

  if (actualType === 'heic' || actualType === 'heif') {
    /*
     * IMPORTANTE: no usamos sharp(file.path).metadata() como prueba de
     * compatibilidad. libvips puede leer los metadatos HEIF y fallar recién
     * al decodificar los píxeles con "Support for this compression format has
     * not been built in". HEIC/HEIF siempre pasa por heic-decode.
     */
    return heicToSharpPipeline(file.path);
  }

  return sharp(file.path, sharpOptions);
};

const optimizeImage = async (file, actualType) => {
  if (file.size > env.maxImageBytes) {
    throw new AppError(`Cada imagen debe pesar como máximo ${Math.round(env.maxImageBytes / 1024 / 1024)} MB antes de optimizarse.`, 400);
  }

  const outputPath = file.path.replace(/\.upload$/i, '.webp');
  const temporaryPath = `${outputPath}.tmp`;

  try {
    const pipeline = await createSharpPipeline(file, actualType);

    await pipeline
      .rotate()
      .resize({
        width: env.imageMaxWidth,
        height: env.imageMaxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toColourspace('srgb')
      .webp({
        quality: env.imageWebpQuality,
        alphaQuality: 90,
        smartSubsample: true,
        effort: 5,
      })
      .toFile(temporaryPath);

    await fs.rename(temporaryPath, outputPath);
    await fs.unlink(file.path);

    const stat = await fs.stat(outputPath);
    file.path = outputPath;
    file.filename = path.basename(outputPath);
    file.mimetype = 'image/webp';
    file.size = stat.size;
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  }
};

const validateAndProcess = async (req) => {
  const files = allFiles(req);
  const total = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  if (total > env.maxUploadTotalBytes) {
    throw new AppError(`La carga completa debe pesar como máximo ${Math.round(env.maxUploadTotalBytes / 1024 / 1024)} MB.`, 400);
  }

  for (const file of files) {
    const actualType = await detectFileType(file.path);

    if (pdfFields.has(file.fieldname)) {
      if (actualType !== 'pdf') throw new AppError('La carta del restaurante debe ser un PDF válido.', 400);
      if (file.size > env.maxPdfBytes) throw new AppError('El PDF supera el tamaño permitido.', 400);
      file.mimetype = 'application/pdf';
    } else {
      if (!supportedImageTypes.has(actualType)) {
        throw new AppError('Solo se aceptan imágenes JPG, PNG, WEBP, HEIC o HEIF válidas.', 400);
      }
      await optimizeImage(file, actualType);
    }
  }
};

const uploadFields = (req, res, next) => {
  rawUpload(req, res, async (error) => {
    if (error) {
      await removePhysicalFiles(allFiles(req));
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          const maxMb = Math.round(Math.max(env.maxImageBytes, env.maxPdfBytes) / 1024 / 1024);
          return next(new AppError(`El archivo supera el máximo permitido de ${maxMb} MB.`, 400));
        }
        return next(new AppError(`Carga inválida: ${error.message}`, 400));
      }
      return next(error);
    }

    try {
      await validateAndProcess(req);
      return next();
    } catch (processingError) {
      await removePhysicalFiles(allFiles(req));
      req.files = {};
      return next(processingError);
    }
  });
};

module.exports = { detectFileType, uploadFields };
