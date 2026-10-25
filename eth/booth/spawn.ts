import { perlin } from '@dfares/hashing';

export type SpawnRules = {
  worldRadius: number;
  innerRadius: number;
  maxLevelDist: number[];
  initPerlinMin: number;
  initPerlinMax: number;
  perlinThreshold1: number;
  perlinThreshold2: number;
  perlinThreshold3: number;
  spaceTypeKey: number;
  perlinLengthScale: number;
  mirrorX: boolean;
  mirrorY: boolean;
};

export type SpawnPoint = { x: number; y: number };

const MAX_CLUSTER_RADIUS = 4000;
const MIN_SEPARATION = 800;
const EDGE_MARGIN = 1000;
const MAX_ATTEMPTS = 64;

const NEBULA = 'NEBULA';

function distance(x: number, y: number): number {
  return Math.hypot(x, y);
}

function spaceTypeAt(rules: SpawnRules, x: number, y: number, perlinValue: number): string {
  const radius = distance(x, y);
  const outer = rules.maxLevelDist[0];
  const inner = rules.maxLevelDist[1];
  if (radius > inner && radius < outer) return NEBULA;
  if (perlinValue >= rules.perlinThreshold3) return 'DEAD_SPACE';
  if (perlinValue >= rules.perlinThreshold2) return 'DEEP_SPACE';
  if (perlinValue >= rules.perlinThreshold1) return 'SPACE';
  return NEBULA;
}

export function perlinAt(rules: SpawnRules, x: number, y: number): number {
  return perlin(
    { x, y },
    {
      key: rules.spaceTypeKey,
      scale: rules.perlinLengthScale,
      mirrorX: rules.mirrorX,
      mirrorY: rules.mirrorY,
      floor: true,
    }
  );
}

/**
 * Active checks from LibPlanet.checkPlayerInit plus LibGameUtils.spaceTypeFromPerlin.
 * The commented SPAWN_RIM_AREA requirement is not applied.
 */
export function isLegalSpawn(rules: SpawnRules, x: number, y: number): boolean {
  const radius = distance(x, y);
  if (radius > rules.worldRadius) return false;
  if (radius * radius < rules.innerRadius * rules.innerRadius) return false;
  if (radius < rules.maxLevelDist[1]) return false;
  const value = perlinAt(rules, x, y);
  if (value < rules.initPerlinMin || value >= rules.initPerlinMax) return false;
  return spaceTypeAt(rules, x, y, value) === NEBULA;
}

type Ring = { inner: number; outer: number };

function forcedNebulaRing(rules: SpawnRules): Ring | null {
  const inner = Math.max(rules.innerRadius, rules.maxLevelDist[1]) + EDGE_MARGIN;
  const outer = Math.min(rules.worldRadius, rules.maxLevelDist[0]) - EDGE_MARGIN;
  if (outer <= inner) return null;
  return { inner, outer };
}

function fullLegalRing(rules: SpawnRules): Ring | null {
  const inner = Math.max(rules.innerRadius, rules.maxLevelDist[1]) + EDGE_MARGIN;
  const outer = rules.worldRadius - EDGE_MARGIN;
  if (outer <= inner) return null;
  return { inner, outer };
}

function clusterRadiusFor(count: number, ring: Ring): number {
  const mid = (ring.inner + ring.outer) / 2;
  const room = Math.min(mid - ring.inner, ring.outer - mid);
  const cap = Math.min(MAX_CLUSTER_RADIUS, room);
  if (count <= 1) return 0;
  const needed = MIN_SEPARATION / (2 * Math.sin(Math.PI / count));
  return Math.min(cap, Math.max(needed, Math.min(cap, needed)));
}

function pointsOnCluster(
  center: SpawnPoint,
  count: number,
  clusterRadius: number,
  rotation: number
): SpawnPoint[] {
  if (count === 1 || clusterRadius === 0) return [center];
  const points: SpawnPoint[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rotation + (2 * Math.PI * i) / count;
    points.push({
      x: Math.round(center.x + clusterRadius * Math.cos(angle)),
      y: Math.round(center.y + clusterRadius * Math.sin(angle)),
    });
  }
  return points;
}

function tryCluster(rules: SpawnRules, count: number, ring: Ring): SpawnPoint[] | null {
  const mid = (ring.inner + ring.outer) / 2;
  const clusterRadius = clusterRadiusFor(count, ring);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const angle = (attempt * 2.399963) % (2 * Math.PI);
    const center = {
      x: Math.round(mid * Math.cos(angle)),
      y: Math.round(mid * Math.sin(angle)),
    };
    const points = pointsOnCluster(center, count, clusterRadius, angle);
    if (points.every((point) => isLegalSpawn(rules, point.x, point.y))) {
      return points;
    }
  }
  return null;
}

export function chooseSpawnCluster(rules: SpawnRules, count: number): SpawnPoint[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Account count must be a positive integer');
  }
  if (rules.maxLevelDist.length < 2) {
    throw new Error('Contract MAX_LEVEL_DIST is missing the spawn ring bounds');
  }

  const forced = forcedNebulaRing(rules);
  if (forced) {
    const cluster = tryCluster(rules, count, forced);
    if (cluster) return cluster;
  }

  const fallback = fullLegalRing(rules);
  if (fallback) {
    const cluster = tryCluster(rules, count, fallback);
    if (cluster) return cluster;
  }

  throw new Error(
    'Could not place a spawn cluster inside the contract birth region. Check world radius and perlin bounds.'
  );
}
