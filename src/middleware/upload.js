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
    fileSize: env.maxPdfBytes,
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
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead);
    if (head.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
    if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
    return 'unknown';
  } finally {
    await handle.close();
  }
};

const optimizeImage = async (file) => {
  if (file.size > env.maxImageBytes) {
    throw new AppError(`Cada imagen debe pesar como máximo ${Math.round(env.maxImageBytes / 1024 / 1024)} MB.`, 400);
  }

  const outputPath = file.path.replace(/\.upload$/i, '.webp');
  const temporaryPath = `${outputPath}.tmp`;
  try {
    await sharp(file.path, { failOn: 'error', limitInputPixels: 45_000_000 })
      .rotate()
      .resize({
        width: env.imageMaxWidth,
        height: env.imageMaxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: env.imageWebpQuality, effort: 4 })
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
      if (!['jpeg', 'png', 'webp'].includes(actualType)) {
        throw new AppError('Solo se aceptan imágenes JPG, PNG o WEBP válidas.', 400);
      }
      await optimizeImage(file);
    }
  }
};

const uploadFields = (req, res, next) => {
  rawUpload(req, res, async (error) => {
    if (error) {
      await removePhysicalFiles(allFiles(req));
      if (error instanceof multer.MulterError) {
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
