'use strict';

require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize, Region, Destination, Place } = require('../models');
const { env } = require('../config/env');
const touristPlaces = require('../data/touristPlaces.seed');
const { runPendingMigrations } = require('../database/migration-status');

const ASSET_ROOT = path.resolve(__dirname, '../seed-assets/tourist-places');
const MAIN_DIR = path.join(env.uploadRoot, 'mainImages');
const GALLERY_DIR = path.join(env.uploadRoot, 'gallery');

const slugify = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const today = () => new Date().toISOString().slice(0, 10);

async function ensureDirectories() {
  await Promise.all([
    fs.mkdir(MAIN_DIR, { recursive: true }),
    fs.mkdir(GALLERY_DIR, { recursive: true }),
  ]);
}

async function ensureDestination(regionName, destinationName) {
  const region = await Region.findOne({
    where: {
      countryCode: env.countryCode || 'PE',
      name: { [Op.iLike]: regionName },
    },
  });

  if (!region) {
    throw new Error(`No existe la región "${regionName}". Ejecuta primero las migraciones de la base de datos.`);
  }

  const slug = slugify(destinationName);
  const [destination] = await Destination.findOrCreate({
    where: { regionId: region.id, slug },
    defaults: {
      regionId: region.id,
      name: destinationName,
      slug,
      isActive: true,
      sortOrder: 0,
      shortDescription: `Destino turístico de ${regionName}.`,
    },
  });

  if (destination.name !== destinationName || destination.isActive !== true) {
    await destination.update({ name: destinationName, isActive: true });
  }

  return destination;
}

async function existingPlaceByName(name) {
  return Place.findOne({
    where: {
      category: 'lugar',
      name: { [Op.iLike]: name },
    },
    paranoid: false,
  });
}

function validateMapData(place) {
  if (!place.showOnMap) return;

  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error(`Latitud inválida para ${place.name}.`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(`Longitud inválida para ${place.name}.`);
  }
}

function mapFields(place) {
  validateMapData(place);
  return {
    mapAddress: place.mapAddress || null,
    latitude: place.showOnMap ? place.latitude : null,
    longitude: place.showOnMap ? place.longitude : null,
    showOnMap: Boolean(place.showOnMap),
  };
}

async function copySeedImages(place) {
  const sourceDir = path.join(ASSET_ROOT, place.assetSlug);
  const names = Array.isArray(place.images) ? place.images : [];
  if (!names.length) throw new Error(`No hay imágenes preparadas para ${place.name}.`);

  const slug = slugify(place.name);
  const copiedFiles = [];
  const storedPaths = [];

  for (let index = 0; index < names.length; index += 1) {
    const fileName = names[index];
    const source = path.join(sourceDir, fileName);
    const isMain = index === 0;
    const targetName = isMain
      ? `seed-${slug}.webp`
      : `seed-${slug}-${String(index + 1).padStart(2, '0')}.webp`;
    const targetDir = isMain ? MAIN_DIR : GALLERY_DIR;
    const target = path.join(targetDir, targetName);

    await fs.copyFile(source, target);
    copiedFiles.push(target);
    storedPaths.push(`uploads/${isMain ? 'mainImages' : 'gallery'}/${targetName}`);
  }

  return { copiedFiles, storedPaths };
}

async function removeCopiedFiles(paths) {
  await Promise.all((paths || []).map((filePath) => fs.unlink(filePath).catch(() => undefined)));
}

async function seedPlace(place) {
  const destination = await ensureDestination(place.region, place.destination);
  const existing = await existingPlaceByName(place.name);

  // Si ya existe, NO duplicamos ni reemplazamos sus fotos/descripciones.
  // Solo sincronizamos destino y datos del mapa para que la carga sea segura al re-ejecutarse.
  if (existing) {
    if (existing.deletedAt) {
      return { status: 'deleted', id: existing.id };
    }

    await existing.update({
      destinationId: destination.id,
      city: destination.name,
      ...mapFields(place),
    });

    return { status: place.showOnMap ? 'mapped' : 'updated', id: existing.id };
  }

  const { copiedFiles, storedPaths } = await copySeedImages(place);
  const transaction = await sequelize.transaction();

  try {
    const created = await Place.create({
      name: place.name,
      destinationId: destination.id,
      city: destination.name,
      category: 'lugar',
      shortDescription: place.shortDescription,
      longDescription: place.longDescription,
      price: 0,
      billingDate: today(),
      imageUrl: storedPaths[0],
      // PlaceDetailPage usa gallery cuando existe; por eso incluimos también
      // la imagen principal como primera imagen de la galería.
      gallery: storedPaths,
      isHidden: false,
      ...mapFields(place),
      createdBy: null,
      updatedBy: null,
    }, { transaction });

    await transaction.commit();
    return { status: 'created', id: created.id };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    await removeCopiedFiles(copiedFiles);
    throw error;
  }
}

async function main() {
  if ((env.countryCode || 'PE') !== 'PE') {
    throw new Error('Este catálogo corresponde a Maze Tour Perú (SITE_COUNTRY_CODE=PE).');
  }

  await sequelize.authenticate();
  await runPendingMigrations();
  await ensureDirectories();

  let created = 0;
  let mapped = 0;
  let updated = 0;
  let deleted = 0;

  const mapEnabled = touristPlaces.filter((place) => place.showOnMap).length;

  console.log(`\n[SEED] Lugares turísticos preparados: ${touristPlaces.length}`);
  console.log(`[SEED] Lugares con ubicación de mapa: ${mapEnabled}`);
  console.log('[SEED] No se cargarán hoteles, restaurantes ni Full Days.\n');

  for (const place of touristPlaces) {
    const result = await seedPlace(place);

    if (result.status === 'created') {
      created += 1;
      console.log(`  + ${place.name} (${place.region} / ${place.destination})`);
    } else if (result.status === 'mapped') {
      mapped += 1;
      console.log(`  ↻ ${place.name}: ubicación actualizada.`);
    } else if (result.status === 'deleted') {
      deleted += 1;
      console.log(`  - ${place.name}: existe eliminado; no se restaura.`);
    } else {
      updated += 1;
      console.log(`  = ${place.name}: registro sincronizado, sin activarlo en mapa.`);
    }
  }

  console.log('\n[SEED] Carga finalizada.');
  console.log(`[SEED] Creados: ${created}`);
  console.log(`[SEED] Existentes con mapa actualizado: ${mapped}`);
  console.log(`[SEED] Existentes sincronizados sin mapa: ${updated}`);
  console.log(`[SEED] Eliminados previamente/no restaurados: ${deleted}`);
  console.log('[SEED] Puedes ajustar cualquier pin después desde el módulo Mapas.');
}

main()
  .catch((error) => {
    console.error('\n[SEED] No se pudo completar la carga de lugares turísticos.');
    console.error(error.original || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => undefined);
  });
