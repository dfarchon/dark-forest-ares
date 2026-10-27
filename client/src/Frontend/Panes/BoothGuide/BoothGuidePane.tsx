import { isLocatable } from '@dfares/gamelogic';
import { isUnconfirmedMoveTx } from '@dfares/serde';
import { CursorState, LocatablePlanet, Planet, WorldCoords } from '@dfares/types';
import React, { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import GameUIManager from '../../../Backend/GameLogic/GameUIManager';
import { SpiralPattern } from '../../../Backend/Miner/MiningPatterns';
import { Btn } from '../../Components/Btn';
import { Link } from '../../Components/CoreUI';
import Viewport from '../../Game/Viewport';
import dfstyles from '../../Styles/dfstyles';
import { useUIManager } from '../../Utils/AppHooks';
import { MIN_CHUNK_SIZE } from '../../Utils/constants';
import UIEmitter, { UIEmitterEvent } from '../../Utils/UIEmitter';
import { fogPage } from './FogPage';
import { movePage } from './MovePage';
import { PlanetHalo, planetPage } from './PlanetPage';

const IDLE_RETURN_MS = 4 * 60 * 1000;
const QUICK_ADVANCE_MS = 350;
const PAGE_HOLD_MS = 3000;
const PANEL_WIDTH = 320;
const PANEL_VISIBLE_MARGIN = 48;
const ZOOM_OUT_MS = 1400;
const UNIVERSE_REVEAL_MS = 2200;
const CLOSE_RADII = 28;
const HOME_REST_SPACINGS = 2;
const RETURN_MS = 1200;
const MINED_REVEAL_MS = 2100;
const MINED_FRAME_PAD = 1.55;
export const SEND_PERCENT = 50;
export const SLIDER_ASIDE = 10;
const ZOOM_MAX_RATIO = 0.99;
const UNIVERSE_COVER = 0.8;
const DARK_SEARCH_LIMIT = 8000;
const ON_SCREEN_SHIFT_X = 0.28;
const ON_SCREEN_SHIFT_Y = 0.12;
const ON_SCREEN_MARGIN = 0.08;
const ON_SCREEN_MIN_SHIFT = 0.12;
const ON_SCREEN_SEARCH_LIMIT = 64;
const FRAME_ZOOM_SLACK = 0.15;

export type PageId = 'cover' | 'planet' | 'move' | 'fog' | 'play';
export type TaskId = 'planet' | 'move' | 'fog';
export type StepId =
  | 'zoom'
  | 'zoomIn'
  | 'selectPlanet'
  | 'selectMovePlanet'
  | 'setEnergy'
  | 'pressSend'
  | 'clickNearby'
  | 'pressExplore'
  | 'clickDark';
type DockPhase = 'waiting' | 'running' | 'done';
type TourPhase = 'ready' | 'out' | 'done';

export type StepCopy = {
  label: string;
  hint: string;
  button: string;
  running: string;
  done: string;
  assistLead?: string;
};

export type ViewFrame = { center: WorldCoords; width: number };

export type WatchHooks = {
  ui: GameUIManager;
  stepId: StepId;
  finish: () => void;
  reject: (message: string) => void;
  notify: (message: string) => void;
  showCoach: (text: string | null) => void;
  releaseTour: () => void;
  stopTour: () => void;
  isSettled: () => boolean;
  isRunning: () => boolean;
  moveSeen: { current: string | null };
};

export type AssistHooks = {
  ui: GameUIManager;
  stepId: StepId;
  finish: () => void;
  isDone: () => boolean;
  isCurrent: () => boolean;
  playTour: (target: ViewFrame, onDone: () => void) => void;
  playReveal: (target: ViewFrame, onDone: () => void) => void;
  playApproach: (target: ViewFrame, onDone: () => void) => void;
};

export type GuidePage = {
  id: TaskId;
  steps: StepId[];
  copy: Partial<Record<StepId, StepCopy>>;
  Intro: () => JSX.Element;
  open: (ui: GameUIManager, step: StepId) => void;
  watch: (hooks: WatchHooks) => () => void;
  assist: (hooks: AssistHooks) => Promise<void>;
};

const TASK_PAGES: Record<TaskId, GuidePage> = {
  planet: planetPage,
  move: movePage,
  fog: fogPage,
};

const PAGE_ORDER: PageId[] = ['cover', 'planet', 'move', 'fog', 'play'];
const TASK_ORDER: TaskId[] = ['planet', 'move', 'fog'];

const STEPS = {
  ...planetPage.copy,
  ...movePage.copy,
  ...fogPage.copy,
} as Record<StepId, StepCopy>;

function isTask(page: PageId): page is TaskId {
  return page === 'planet' || page === 'move' || page === 'fog';
}

function pageTitle(page: PageId): string {
  if (!isTask(page)) return page === 'cover' ? 'Visitor guide' : 'You can play';
  return `Page ${TASK_ORDER.indexOf(page) + 1} / ${TASK_ORDER.length}`;
}

function stepsOf(page: PageId): StepId[] {
  return isTask(page) ? TASK_PAGES[page].steps : [];
}

function firstStep(page: PageId): StepId | null {
  return stepsOf(page)[0] ?? null;
}

function following(page: PageId, step: StepId): { page: PageId; step: StepId | null } {
  const steps = stepsOf(page);
  const index = steps.indexOf(step);
  if (index >= 0 && index < steps.length - 1) return { page, step: steps[index + 1] };
  const nextPage = PAGE_ORDER[PAGE_ORDER.indexOf(page) + 1] ?? 'play';
  return { page: nextPage, step: firstStep(nextPage) };
}

function isPageFinale(page: PageId, step: StepId): boolean {
  return (
    (page === 'planet' && step === 'selectPlanet') ||
    (page === 'move' && step === 'clickNearby') ||
    (page === 'fog' && step === 'clickDark')
  );
}

function failMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0 && error.message.length < 140) {
    return error.message;
  }
  return fallback;
}

export function locatableHome(ui: GameUIManager): LocatablePlanet | undefined {
  const home = ui.getHomePlanet();
  return home && isLocatable(home) ? home : undefined;
}

export function sourcePlanet(ui: GameUIManager): LocatablePlanet | undefined {
  const home = ui.getHomePlanet();
  if (home && isLocatable(home) && home.energy > 1) return home;
  const owned = ui
    .getGameManager()
    .getMyPlanets()
    .filter((planet): planet is LocatablePlanet => isLocatable(planet) && planet.energy > 1)
    .sort((a, b) => b.energy - a.energy);
  if (owned[0]) return owned[0];
  return home && isLocatable(home) ? home : undefined;
}

export function pickTarget(
  ui: GameUIManager,
  from: LocatablePlanet,
  enemyOnly: boolean,
  percent: number = SEND_PERCENT
): LocatablePlanet | undefined {
  let planets: Planet[] = [];
  try {
    planets = ui.getGameManager().getPlanetsInRange(from.locationId, percent, false);
  } catch {
    return undefined;
  }
  const fromCoords = from.location.coords;
  const candidates = planets.filter((planet): planet is LocatablePlanet => {
    if (!isLocatable(planet) || planet.locationId === from.locationId) return false;
    if (enemyOnly && ui.isOwnedByMe(planet)) return false;
    return true;
  });
  candidates.sort(
    (a, b) =>
      ui.getDistCoords(fromCoords, a.location.coords) -
      ui.getDistCoords(fromCoords, b.location.coords)
  );
  return candidates[0];
}

export function moveDestinationKey(ui: GameUIManager): string {
  return `${ui.getAccount()?.toLowerCase()}-toPlanet`;
}

function clearLocalControls(ui: GameUIManager, preserveSelection = false): void {
  UIEmitter.getInstance().emit(UIEmitterEvent.SendCancelled);
  if (!preserveSelection) ui.setSelectedPlanet(undefined);
  ui.getModalManager().setCursorState(CursorState.Normal);
}

export function armSend(ui: GameUIManager, planet: LocatablePlanet): void {
  ui.setSending(true);
  UIEmitter.getInstance().emit(UIEmitterEvent.SendInitiated, planet);
}

export async function sendFleet(
  ui: GameUIManager,
  from: LocatablePlanet,
  to: LocatablePlanet
): Promise<void> {
  const game = ui.getGameManager();
  let effective = from.energy;
  for (const tx of from.transactions?.getTransactions(isUnconfirmedMoveTx) ?? []) {
    effective -= tx.intent.forces;
  }
  const percent = Math.min(ui.getForcesSending(from.locationId), 98);
  let forces = Math.floor((effective * percent) / 100);
  if (forces >= from.energy) forces = from.energy - 1;
  if (forces < 1) throw new Error('Not enough energy on this planet.');
  const dist = game.getDist(from.locationId, to.locationId);
  const arriving = game.getEnergyArrivingForMove(
    from.locationId,
    to.locationId,
    dist,
    forces,
    false
  );
  if (!(arriving > 0)) throw new Error('That planet is out of range.');
  await game.move(from.locationId, to.locationId, forces, 0);
}

export function findDarkPatch(ui: GameUIManager): WorldCoords | undefined {
  const home = ui.getHomeCoords();
  const pattern = new SpiralPattern(home, MIN_CHUNK_SIZE);
  const radius = Math.max(ui.getWorldRadius(), 1);
  const game = ui.getGameManager();
  let chunk = pattern.fromChunk;
  for (let i = 0; i < DARK_SEARCH_LIMIT; i++) {
    chunk = pattern.nextChunk(chunk);
    const coords = {
      x: chunk.bottomLeft.x + chunk.sideLength / 2,
      y: chunk.bottomLeft.y + chunk.sideLength / 2,
    };
    if (coords.x ** 2 + coords.y ** 2 >= radius ** 2) continue;
    if (!game.hasMinedChunk(chunk)) return coords;
  }
  return undefined;
}

function chunkCenter(chunk: { bottomLeft: WorldCoords; sideLength: number }): WorldCoords {
  return {
    x: chunk.bottomLeft.x + chunk.sideLength / 2,
    y: chunk.bottomLeft.y + chunk.sideLength / 2,
  };
}

function minerAnchor(ui: GameUIManager): WorldCoords {
  const live = ui.getMinerLocation();
  if (live) return { x: live.x, y: live.y };
  const exploring = ui.getGameManager().getCurrentlyExploringChunk();
  if (exploring) return chunkCenter(exploring);
  const pattern = ui.getMiningPattern();
  if (pattern) return chunkCenter(pattern.fromChunk);
  return { ...ui.getHomeCoords() };
}

function neighborhoodWidth(ui: GameUIManager, viewport: Viewport): number {
  const home = locatableHome(ui);
  if (!home) return viewport.widthInWorldUnits;
  const rad = Math.max(ui.getRadiusOfPlanetLevel(home.planetLevel), 1);
  const height = CLOSE_RADII * 14 * rad;
  return clampWidth(height * aspectRatio(viewport), viewport);
}

function minerCenterFrame(ui: GameUIManager): ViewFrame {
  const viewport = Viewport.getInstance();
  const anchor = minerAnchor(ui);
  let minX = anchor.x;
  let maxX = anchor.x;
  let minY = anchor.y;
  let maxY = anchor.y;
  for (const chunk of ui.getGameManager().getExploredChunks()) {
    const box = chunk.chunkFootprint;
    minX = Math.min(minX, box.bottomLeft.x);
    maxX = Math.max(maxX, box.bottomLeft.x + box.sideLength);
    minY = Math.min(minY, box.bottomLeft.y);
    maxY = Math.max(maxY, box.bottomLeft.y + box.sideLength);
  }
  const reachX = Math.max(anchor.x - minX, maxX - anchor.x);
  const reachY = Math.max(anchor.y - minY, maxY - anchor.y);
  const aspect = aspectRatio(viewport);
  const span = Math.max(
    reachX * 2,
    reachY * 2 * aspect,
    neighborhoodWidth(ui, viewport) / MINED_FRAME_PAD
  );
  return {
    center: anchor,
    width: clampWidth(span * MINED_FRAME_PAD, viewport),
  };
}

function minerAlreadyFramed(ui: GameUIManager): boolean {
  const viewport = Viewport.getInstance();
  const frame = minerCenterFrame(ui);
  const center = viewport.getViewportPosition();
  const width = viewport.getViewportWorldWidth();
  const height = viewport.getViewportWorldHeight();
  if (width > frame.width * (1 + FRAME_ZOOM_SLACK)) return false;
  if (width < frame.width * (1 - FRAME_ZOOM_SLACK)) return false;
  return (
    Math.abs(frame.center.x - center.x) <= width * ON_SCREEN_MIN_SHIFT &&
    Math.abs(frame.center.y - center.y) <= height * ON_SCREEN_MIN_SHIFT
  );
}

export function findOnScreenDarkPatch(ui: GameUIManager): WorldCoords | undefined {
  const viewport = Viewport.getInstance();
  const frame = minerCenterFrame(ui);
  const anchor = frame.center;
  const liveWidth = viewport.getViewportWorldWidth();
  const liveHeight = viewport.getViewportWorldHeight();
  const useLive = minerAlreadyFramed(ui) || liveWidth <= frame.width * (1 + FRAME_ZOOM_SLACK);
  const center = useLive ? viewport.getViewportPosition() : frame.center;
  const width = useLive ? liveWidth : frame.width;
  const height = useLive ? liveHeight : frame.width / aspectRatio(viewport);
  const left = center.x - width / 2;
  const right = center.x + width / 2;
  const bottom = center.y - height / 2;
  const top = center.y + height / 2;
  const marginX = width * ON_SCREEN_MARGIN;
  const marginY = height * ON_SCREEN_MARGIN;
  const minShift = Math.min(width, height) * ON_SCREEN_MIN_SHIFT;
  const preferred = {
    x: anchor.x + width * ON_SCREEN_SHIFT_X,
    y: anchor.y + height * ON_SCREEN_SHIFT_Y,
  };
  const pattern = new SpiralPattern(preferred, MIN_CHUNK_SIZE);
  const radius = Math.max(ui.getWorldRadius(), 1);
  const game = ui.getGameManager();
  let chunk = pattern.fromChunk;
  for (let i = 0; i < ON_SCREEN_SEARCH_LIMIT; i++) {
    const coords = chunkCenter(chunk);
    const onScreen =
      coords.x >= left + marginX &&
      coords.x <= right - marginX &&
      coords.y >= bottom + marginY &&
      coords.y <= top - marginY;
    const shifted = Math.hypot(coords.x - anchor.x, coords.y - anchor.y) >= minShift;
    const insideWorld = coords.x ** 2 + coords.y ** 2 < radius ** 2;
    if (onScreen && shifted && insideWorld && !game.hasMinedChunk(chunk)) return coords;
    chunk = pattern.nextChunk(chunk);
  }
  return findDarkPatch(ui);
}

function isControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('df-button, button, a'));
}

function eventInPanel(event: Event, panel: HTMLElement | null): boolean {
  return Boolean(panel && event.composedPath().includes(panel));
}

function eventOnPanelButton(event: Event, panel: HTMLElement | null): boolean {
  if (!eventInPanel(event, panel)) return false;
  return event.composedPath().some((node) => node instanceof HTMLButtonElement);
}

function blurPanelFocus(panel: HTMLElement | null): void {
  if (!panel) return;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !panel.contains(active)) return;
  const inner = active.shadowRoot?.activeElement;
  if (inner instanceof HTMLElement) inner.blur();
  active.blur();
}

function clampPosition(x: number, y: number, parent: HTMLElement | null): { x: number; y: number } {
  const width = parent?.clientWidth ?? window.innerWidth;
  const height = parent?.clientHeight ?? window.innerHeight;
  return {
    x: Math.min(Math.max(x, PANEL_VISIBLE_MARGIN - PANEL_WIDTH), width - PANEL_VISIBLE_MARGIN),
    y: Math.min(Math.max(y, 0), Math.max(0, height - PANEL_VISIBLE_MARGIN)),
  };
}

function easeInOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - (-2 * clamped + 2) ** 2 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpLog(a: number, b: number, t: number): number {
  const start = Math.log(Math.max(a, 1));
  const end = Math.log(Math.max(b, 1));
  return Math.exp(start + (end - start) * t);
}

function clampWidth(width: number, viewport: Viewport): number {
  return Math.min(viewport.maxWorldWidth, Math.max(viewport.minWorldWidth, width));
}

function aspectRatio(viewport: Viewport): number {
  if (viewport.viewportHeight <= 0) return 1;
  return viewport.viewportWidth / viewport.viewportHeight;
}

function homeRestFrame(ui: GameUIManager, viewport: Viewport): ViewFrame {
  const home = locatableHome(ui);
  const center = home ? { ...home.location.coords } : { ...ui.getHomeCoords() };
  const spacing = Math.sqrt(Math.max(ui.getGameManager().getPlanetRarity(), 1));
  const height = HOME_REST_SPACINGS * spacing;
  return {
    center,
    width: clampWidth(height * aspectRatio(viewport), viewport),
  };
}

export function universeFrame(ui: GameUIManager, viewport: Viewport): ViewFrame {
  const radius = Math.max(ui.getWorldRadius(), 1);
  const span = Math.max(aspectRatio(viewport), 1);
  return {
    center: { x: 0, y: 0 },
    width: clampWidth(radius * 2 * span * 1.08, viewport),
  };
}

function applyView(viewport: Viewport, center: WorldCoords, width: number): void {
  viewport.setData({
    widthInWorldUnits: clampWidth(width, viewport),
    centerWorldCoords: center,
  });
}

function axisCover(viewMin: number, viewMax: number, radius: number): number {
  const overlap = Math.min(viewMax, radius) - Math.max(viewMin, -radius);
  return overlap / (radius * 2);
}

export function universeOnScreen(ui: GameUIManager): boolean {
  const viewport = Viewport.getInstance();
  const radius = Math.max(ui.getWorldRadius(), 1);
  const cover = Math.min(
    axisCover(viewport.getLeftBound(), viewport.getRightBound(), radius),
    axisCover(viewport.getBottomBound(), viewport.getTopBound(), radius)
  );
  if (cover >= UNIVERSE_COVER) return true;
  const originInside =
    viewport.getLeftBound() <= 0 &&
    viewport.getRightBound() >= 0 &&
    viewport.getBottomBound() <= 0 &&
    viewport.getTopBound() >= 0;
  return scrolledOutFully() && originInside;
}

export function scrolledOutFully(): boolean {
  const viewport = Viewport.getInstance();
  return viewport.widthInWorldUnits >= viewport.maxWorldWidth * ZOOM_MAX_RATIO;
}

export function planetCloseFrame(ui: GameUIManager, planet: LocatablePlanet): ViewFrame {
  const viewport = Viewport.getInstance();
  const rad = Math.max(ui.getRadiusOfPlanetLevel(planet.planetLevel), 1);
  return {
    center: { ...planet.location.coords },
    width: clampWidth(CLOSE_RADII * rad * aspectRatio(viewport), viewport),
  };
}

export function approachPlanetFrame(ui: GameUIManager): ViewFrame {
  const planet = sourcePlanet(ui);
  if (planet) return planetCloseFrame(ui, planet);
  const viewport = Viewport.getInstance();
  const home = ui.getHomePlanet();
  const rad = Math.max(home ? ui.getRadiusOfPlanetLevel(home.planetLevel) : 1, 1);
  return {
    center: { ...ui.getHomeCoords() },
    width: clampWidth(CLOSE_RADII * rad * aspectRatio(viewport), viewport),
  };
}

export function planetNearCenter(ui: GameUIManager): boolean {
  const planet = sourcePlanet(ui);
  if (!planet) return false;
  const viewport = Viewport.getInstance();
  const nearbyWidth = approachPlanetFrame(ui).width * 4;
  if (viewport.getViewportWorldWidth() > nearbyWidth) return false;
  const center = viewport.getViewportPosition();
  const dx = Math.abs(planet.location.coords.x - center.x);
  const dy = Math.abs(planet.location.coords.y - center.y);
  return (
    dx <= viewport.getViewportWorldWidth() * 0.25 && dy <= viewport.getViewportWorldHeight() * 0.25
  );
}

export function showClose(ui: GameUIManager, planet: LocatablePlanet): void {
  const viewport = Viewport.getInstance();
  const rad = Math.max(ui.getRadiusOfPlanetLevel(planet.planetLevel), 1);
  const height = CLOSE_RADII * rad;
  applyView(viewport, { ...planet.location.coords }, height * aspectRatio(viewport));
}

export function showNeighborhood(ui: GameUIManager): void {
  const home = locatableHome(ui);
  const viewport = Viewport.getInstance();
  if (!home) {
    viewport.centerCoords(ui.getHomeCoords());
    return;
  }
  const rad = Math.max(ui.getRadiusOfPlanetLevel(home.planetLevel), 1);
  const height = CLOSE_RADII * 14 * rad;
  applyView(viewport, { ...home.location.coords }, height * aspectRatio(viewport));
}

function coordsFrame(viewport: Viewport, a: WorldCoords, b: WorldCoords): ViewFrame {
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const aspect = aspectRatio(viewport);
  const width = Math.max(dx * 1.8, dy * 1.8 * aspect, viewport.minWorldWidth * 40);
  return { center, width: clampWidth(width, viewport) };
}

export function frameCoords(viewport: Viewport, a: WorldCoords, b: WorldCoords): void {
  const frame = coordsFrame(viewport, a, b);
  applyView(viewport, frame.center, frame.width);
}

function moveGuideFrame(ui: GameUIManager, viewport: Viewport): ViewFrame {
  const from = sourcePlanet(ui);
  if (!from) return homeRestFrame(ui, viewport);
  const target = pickTarget(ui, from, false, SEND_PERCENT);
  if (!target) return planetCloseFrame(ui, from);
  return coordsFrame(viewport, from.location.coords, target.location.coords);
}

function playViewTour(target: ViewFrame, onPhase: (phase: TourPhase) => void): () => void {
  const viewport = Viewport.getInstance();
  const startCenter = { ...viewport.centerWorldCoords };
  const startWidth = viewport.widthInWorldUnits;
  const started = performance.now();
  let frame = 0;
  let stopped = false;
  let lastPhase: TourPhase | null = null;

  const report = (phase: TourPhase) => {
    if (phase === lastPhase) return;
    lastPhase = phase;
    onPhase(phase);
  };

  const tick = (now: number) => {
    if (stopped) return;
    const elapsed = now - started;
    report('out');
    if (elapsed < ZOOM_OUT_MS) {
      const t = easeInOut(elapsed / ZOOM_OUT_MS);
      applyView(
        viewport,
        {
          x: lerp(startCenter.x, target.center.x, t),
          y: lerp(startCenter.y, target.center.y, t),
        },
        lerpLog(startWidth, target.width, t)
      );
    } else {
      applyView(viewport, target.center, target.width);
      report('done');
      stopped = true;
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}

function playUniverseReveal(target: ViewFrame, onPhase: (phase: TourPhase) => void): () => void {
  const viewport = Viewport.getInstance();
  const startCenter = { ...viewport.centerWorldCoords };
  const startWidth = Math.max(viewport.widthInWorldUnits, 1);
  const goalWidth = Math.max(target.width, 1);
  const started = performance.now();
  let frame = 0;
  let stopped = false;
  let lastPhase: TourPhase | null = null;

  const report = (phase: TourPhase) => {
    if (phase === lastPhase) return;
    lastPhase = phase;
    onPhase(phase);
  };

  const tick = (now: number) => {
    if (stopped) return;
    const elapsed = now - started;
    report('out');
    if (elapsed < UNIVERSE_REVEAL_MS) {
      const ease = easeInOut(elapsed / UNIVERSE_REVEAL_MS);
      const width = lerpLog(startWidth, goalWidth, ease);
      const blend = Math.min(1, ease * (width / goalWidth));
      applyView(
        viewport,
        {
          x: lerp(startCenter.x, target.center.x, blend),
          y: lerp(startCenter.y, target.center.y, blend),
        },
        width
      );
    } else {
      applyView(viewport, target.center, target.width);
      report('done');
      stopped = true;
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}

function playPlanetApproach(target: ViewFrame, onPhase: (phase: TourPhase) => void): () => void {
  const viewport = Viewport.getInstance();
  const startCenter = { ...viewport.centerWorldCoords };
  const startWidth = Math.max(viewport.widthInWorldUnits, 1);
  const goalWidth = Math.max(target.width, 1);
  const started = performance.now();
  let frame = 0;
  let stopped = false;
  let lastPhase: TourPhase | null = null;

  const report = (phase: TourPhase) => {
    if (phase === lastPhase) return;
    lastPhase = phase;
    onPhase(phase);
  };

  const tick = (now: number) => {
    if (stopped) return;
    const elapsed = now - started;
    report('out');
    if (elapsed < UNIVERSE_REVEAL_MS) {
      const ease = easeInOut(elapsed / UNIVERSE_REVEAL_MS);
      const width = lerpLog(startWidth, goalWidth, ease);
      const k = Math.min(1, Math.max(0, (1 - ease) * (width / startWidth)));
      applyView(
        viewport,
        {
          x: lerp(target.center.x, startCenter.x, k),
          y: lerp(target.center.y, startCenter.y, k),
        },
        width
      );
    } else {
      applyView(viewport, target.center, target.width);
      report('done');
      stopped = true;
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}

function playDampedReturn(target: ViewFrame): () => void {
  const viewport = Viewport.getInstance();
  const emitter = UIEmitter.getInstance();
  const startCenter = { ...viewport.centerWorldCoords };
  const startWidth = Math.max(viewport.widthInWorldUnits, 1);
  const goalWidth = Math.max(target.width, 1);
  const started = performance.now();
  let frameId = 0;
  let stopped = false;

  const halt = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frameId);
    emitter.removeListener(UIEmitterEvent.CanvasMouseDown, onUser);
    emitter.removeListener(UIEmitterEvent.CanvasScroll, onUser);
    emitter.removeListener(UIEmitterEvent.ZoomIn, onUser);
    emitter.removeListener(UIEmitterEvent.ZoomOut, onUser);
  };
  const onUser = () => halt();

  const tick = (now: number) => {
    if (stopped) return;
    if (now - started >= RETURN_MS) {
      applyView(viewport, target.center, target.width);
      halt();
      return;
    }
    const s = easeInOut((now - started) / RETURN_MS);
    const width = lerpLog(startWidth, goalWidth, s);
    const k = (1 - s) * (width / startWidth);
    applyView(
      viewport,
      {
        x: target.center.x - (target.center.x - startCenter.x) * k,
        y: target.center.y - (target.center.y - startCenter.y) * k,
      },
      width
    );
    frameId = requestAnimationFrame(tick);
  };

  emitter.on(UIEmitterEvent.CanvasMouseDown, onUser);
  emitter.on(UIEmitterEvent.CanvasScroll, onUser);
  emitter.on(UIEmitterEvent.ZoomIn, onUser);
  emitter.on(UIEmitterEvent.ZoomOut, onUser);
  frameId = requestAnimationFrame(tick);
  return halt;
}

function playMinedReveal(target: ViewFrame): () => void {
  const viewport = Viewport.getInstance();
  const emitter = UIEmitter.getInstance();
  const startCenter = { ...viewport.centerWorldCoords };
  const startWidth = Math.max(viewport.widthInWorldUnits, 1);
  const goalWidth = Math.max(target.width, 1);
  const started = performance.now();
  let frameId = 0;
  let stopped = false;

  const halt = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frameId);
    emitter.removeListener(UIEmitterEvent.CanvasMouseDown, onUser);
    emitter.removeListener(UIEmitterEvent.CanvasScroll, onUser);
    emitter.removeListener(UIEmitterEvent.ZoomIn, onUser);
    emitter.removeListener(UIEmitterEvent.ZoomOut, onUser);
  };
  const onUser = () => halt();

  const tick = (now: number) => {
    if (stopped) return;
    if (now - started >= MINED_REVEAL_MS) {
      applyView(viewport, target.center, target.width);
      halt();
      return;
    }
    const t = easeInOut((now - started) / MINED_REVEAL_MS);
    applyView(
      viewport,
      {
        x: lerp(startCenter.x, target.center.x, t),
        y: lerp(startCenter.y, target.center.y, t),
      },
      lerpLog(startWidth, goalWidth, t)
    );
    frameId = requestAnimationFrame(tick);
  };

  emitter.on(UIEmitterEvent.CanvasMouseDown, onUser);
  emitter.on(UIEmitterEvent.CanvasScroll, onUser);
  emitter.on(UIEmitterEvent.ZoomIn, onUser);
  emitter.on(UIEmitterEvent.ZoomOut, onUser);
  frameId = requestAnimationFrame(tick);
  return halt;
}

export function focusHome(ui: GameUIManager): void {
  const home = locatableHome(ui);
  if (home) showClose(ui, home);
  else Viewport.getInstance().centerCoords(ui.getHomeCoords());
}

const Panel = styled.aside`
  position: absolute;
  z-index: 10;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: ${PANEL_WIDTH}px;
  padding: 12px;
  overflow: hidden;
  background: ${dfstyles.colors.backgroundlighter};
  color: ${dfstyles.colors.text};
  border: 1px solid ${dfstyles.colors.border};
  line-height: 1.45;

  p {
    margin: 0 0 8px;
  }

  ul {
    margin: 0 0 8px;
    padding-left: 1.1em;
  }

  li + li {
    margin-top: 4px;
  }
`;

const Body = styled.div`
  min-height: 0;
  overflow-y: auto;
`;

const DragBar = styled.div`
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: -12px -12px 12px;
  padding: 8px 12px;
  cursor: grab;
  user-select: none;
  touch-action: none;
  border-bottom: 1px solid ${dfstyles.colors.border};

  &:active {
    cursor: grabbing;
  }
`;

const StepList = styled.ol`
  margin: 0 0 8px;
  padding: 0;
  list-style: none;

  li + li {
    margin-top: 0;
  }
`;

const StepButton = styled.button<{ $current: boolean }>`
  display: block;
  width: 100%;
  margin: 0;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: ${({ $current }) => ($current ? dfstyles.colors.dfgreen : dfstyles.colors.text)};
  font: inherit;
  font-weight: ${({ $current }) => ($current ? 600 : 400)};
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
  outline: none;

  &:hover {
    text-decoration: underline;
  }

  &:focus,
  &:focus-visible {
    outline: none;
  }
`;

const Dock = styled.div`
  flex: none;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid ${dfstyles.colors.border};
`;

const DockStatus = styled.p<{ $done: boolean }>`
  color: ${({ $done }) => ($done ? dfstyles.colors.dfgreen : dfstyles.colors.text)};
  white-space: pre-line;
`;

const celebrationPulse = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.7);
  }
  30% {
    opacity: 1;
    transform: scale(1.12);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
`;

const CompleteCelebration = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  color: ${dfstyles.colors.dfpink};
  animation: ${celebrationPulse} 500ms ease-out both;

  span {
    position: relative;
    display: inline-block;
    width: 20px;
    height: 20px;
    flex: none;
    border: 2px solid ${dfstyles.colors.dfpink};
    border-radius: 50%;
    box-shadow: 0 0 8px ${dfstyles.colors.dfpink};
  }
`;

const BrightAction = styled.div`
  margin-top: 12px;

  df-button {
    width: 100%;
    --df-button-color: ${dfstyles.colors.dfgreen};
    --df-button-border: 1px solid ${dfstyles.colors.dfgreen};
    --df-button-hover-border: 1px solid ${dfstyles.colors.dfgreen};
  }
`;

const PageNav = styled.div`
  display: flex;
  flex: none;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
`;

function CoverCopy({ onStart }: { onStart: () => void }) {
  return (
    <>
      <p>Dark Forest is a fully onchain ZK warfare of exploration, strategy, and conquest.</p>
      <p>
        Following the prompts in the guide will give you a basic understanding of how to interact
        with the universe.
      </p>
      <BrightAction>
        <Btn size='stretch' onClick={onStart}>
          Start guide
        </Btn>
      </BrightAction>
    </>
  );
}

function PlayCopy() {
  return (
    <>
      <p>
        This is the whole guide, only a basic introduction. Dark Forest has more worth exploring.
      </p>
      <p>
        Follow us on Twitter:{' '}
        <Link to='https://twitter.com/DFArchon' color={dfstyles.colors.dfpink}>
          @DFArchon
        </Link>
      </p>
    </>
  );
}

export function BoothGuidePane() {
  const uiManager = useUIManager();
  const panelRef = useRef<HTMLElement | null>(null);
  const dragOrigin = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const stopTour = useRef<(() => void) | null>(null);
  const stopHomeReturn = useRef<() => void>(() => {});
  const finishRef = useRef<() => void>(() => {});
  const phaseRef = useRef<DockPhase>('waiting');
  const entryRef = useRef(0);
  const moveSeenRef = useRef<string | null>(null);
  const pageAtEntry = useRef<PageId>('cover');
  const retainFogCamera = useRef(false);
  const openRef = useRef<(nextPage: PageId, nextStep: StepId | null) => void>(() => {});
  const [position, setPosition] = useState({ x: 56, y: 52 });
  const [page, setPage] = useState<PageId>('cover');
  const [stepId, setStepId] = useState<StepId | null>(null);
  const [phase, setPhase] = useState<DockPhase>('waiting');
  const [notice, setNotice] = useState<string | null>(null);
  const [coach, setCoach] = useState<string | null>(null);
  const [entry, setEntry] = useState(0);
  const [pageCountdown, setPageCountdown] = useState<number | null>(null);

  phaseRef.current = phase;
  entryRef.current = entry;

  const stopCameraTour = () => {
    stopTour.current?.();
    stopTour.current = null;
  };

  const open = (nextPage: PageId, nextStep: StepId | null) => {
    stopCameraTour();
    retainFogCamera.current = page === 'fog' && nextPage === 'fog';
    if (!retainFogCamera.current) {
      stopHomeReturn.current();
      stopHomeReturn.current = () => {};
    }
    phaseRef.current = 'waiting';
    setPage(nextPage);
    setStepId(nextStep);
    setPhase('waiting');
    setNotice(null);
    setCoach(null);
    setEntry((n) => n + 1);
  };
  openRef.current = open;

  useEffect(() => {
    return () => {
      stopCameraTour();
      stopHomeReturn.current();
      stopHomeReturn.current = () => {};
    };
  }, []);

  useEffect(() => {
    const stopButtonKeys = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter' && event.code !== 'Space') return;
      if (!eventInPanel(event, panelRef.current)) return;
      event.preventDefault();
    };
    const keepButtonsUnfocused = (event: MouseEvent) => {
      if (!eventOnPanelButton(event, panelRef.current)) return;
      event.preventDefault();
    };
    window.addEventListener('keydown', stopButtonKeys, true);
    window.addEventListener('mousedown', keepButtonsUnfocused, true);
    return () => {
      window.removeEventListener('keydown', stopButtonKeys, true);
      window.removeEventListener('mousedown', keepButtonsUnfocused, true);
    };
  }, []);

  useEffect(() => {
    blurPanelFocus(panelRef.current);
  }, [page, stepId, phase]);

  useEffect(() => {
    if (page === 'cover') return;
    const returnToCover = () => openRef.current('cover', null);
    let timer = window.setTimeout(returnToCover, IDLE_RETURN_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(returnToCover, IDLE_RETURN_MS);
    };
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    window.addEventListener('wheel', bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
      window.removeEventListener('wheel', bump);
    };
  }, [page]);

  useEffect(() => {
    if (phase !== 'done' || !stepId) return;
    const next = following(page, stepId);
    const finale = isPageFinale(page, stepId);
    const delay = finale
      ? PAGE_HOLD_MS
      : (page === 'planet' && (stepId === 'zoom' || stepId === 'zoomIn')) ||
        (page === 'move' && stepId === 'pressSend')
      ? 0
      : QUICK_ADVANCE_MS;
    let tick = 0;
    if (finale) {
      const seconds = PAGE_HOLD_MS / 1000;
      const started = performance.now();
      setPageCountdown(seconds);
      tick = window.setInterval(() => {
        const left = Math.ceil((PAGE_HOLD_MS - (performance.now() - started)) / 1000);
        setPageCountdown(Math.max(0, left));
      }, 200);
    }
    const timer = window.setTimeout(() => openRef.current(next.page, next.step), delay);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(tick);
      setPageCountdown(null);
    };
  }, [phase, page, stepId]);

  useEffect(() => {
    if (entry === 0 && stepId === null) return;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      phaseRef.current = 'done';
      setNotice(null);
      setPhase('done');
    };
    finishRef.current = finish;
    const reject = (message: string) => {
      if (settled) return;
      phaseRef.current = 'waiting';
      setNotice(message);
      setPhase('waiting');
    };

    const keepReveal = retainFogCamera.current;
    retainFogCamera.current = false;
    stopCameraTour();
    const enteringFog = page === 'fog' && pageAtEntry.current !== 'fog';
    pageAtEntry.current = page;
    const preserveMoveSelection = page === 'move' && stepId !== 'selectMovePlanet';
    clearLocalControls(uiManager, preserveMoveSelection);
    if (!keepReveal) {
      if (page === 'cover') {
        stopHomeReturn.current = playDampedReturn(homeRestFrame(uiManager, Viewport.getInstance()));
      } else if (page === 'move' && stepId === 'selectMovePlanet') {
        stopHomeReturn.current = playDampedReturn(moveGuideFrame(uiManager, Viewport.getInstance()));
      } else if (page === 'fog' && (enteringFog || !minerAlreadyFramed(uiManager))) {
        stopHomeReturn.current = playMinedReveal(minerCenterFrame(uiManager));
      }
    }

    const stopWatchers: Array<() => void> = [];
    if (stepId && isTask(page)) {
      const taskPage = TASK_PAGES[page];
      taskPage.open(uiManager, stepId);
      const showCoach = (text: string | null) => {
        setCoach((prev) => (prev === text ? prev : text));
      };
      const releaseTour = () => {
        if (!stopTour.current || settled) return;
        stopCameraTour();
        phaseRef.current = 'waiting';
        setPhase('waiting');
      };
      stopWatchers.push(
        taskPage.watch({
          ui: uiManager,
          stepId,
          finish,
          reject,
          notify: (message) => setNotice(message),
          showCoach,
          releaseTour,
          stopTour: stopCameraTour,
          isSettled: () => settled,
          isRunning: () => phaseRef.current === 'running',
          moveSeen: moveSeenRef,
        })
      );
    }

    return () => {
      settled = true;
      finishRef.current = () => {};
      stopWatchers.forEach((stop) => stop());
      if (retainFogCamera.current) return;
      stopCameraTour();
      stopHomeReturn.current();
      stopHomeReturn.current = () => {};
    };
  }, [entry, stepId, page, uiManager]);

  const runAssist = () => {
    if (!stepId || !isTask(page) || phaseRef.current !== 'waiting') return;
    const generation = entryRef.current;
    const step = stepId;
    const task = page;
    phaseRef.current = 'running';
    setNotice(null);
    setPhase('running');

    void (async () => {
      try {
        await TASK_PAGES[task].assist({
          ui: uiManager,
          stepId: step,
          finish: () => finishRef.current(),
          isDone: () => phaseRef.current === 'done',
          isCurrent: () => entryRef.current === generation,
          playTour: (target, onDone) => {
            stopTour.current = playViewTour(target, (tourPhase) => {
              if (tourPhase !== 'done') return;
              stopTour.current = null;
              onDone();
            });
          },
          playReveal: (target, onDone) => {
            stopTour.current = playUniverseReveal(target, (tourPhase) => {
              if (tourPhase !== 'done') return;
              stopTour.current = null;
              onDone();
            });
          },
          playApproach: (target, onDone) => {
            stopTour.current = playPlanetApproach(target, (tourPhase) => {
              if (tourPhase !== 'done') return;
              stopTour.current = null;
              onDone();
            });
          },
        });
      } catch (error) {
        if (entryRef.current !== generation || phaseRef.current !== 'running') return;
        moveSeenRef.current = localStorage.getItem(moveDestinationKey(uiManager));
        phaseRef.current = 'waiting';
        setPhase('waiting');
        setNotice(failMessage(error, 'That did not work. Try the step yourself, or press again.'));
      }
    })();
  };

  const onHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isControlTarget(event.target)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: position.x,
      top: position.y,
    };
  };

  const onHandlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    setPosition(
      clampPosition(
        origin.left + event.clientX - origin.x,
        origin.top + event.clientY - origin.y,
        panelRef.current?.parentElement ?? null
      )
    );
  };

  const onHandlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragOrigin.current?.pointerId === event.pointerId) dragOrigin.current = null;
  };

  const resetToCover = () => {
    open('cover', null);
  };

  const pageIndex = PAGE_ORDER.indexOf(page);
  const previous = pageIndex > 0 ? PAGE_ORDER[pageIndex - 1] : null;
  const next = pageIndex < PAGE_ORDER.length - 1 ? PAGE_ORDER[pageIndex + 1] : null;
  const taskPage = isTask(page) ? TASK_PAGES[page] : null;
  const step = stepId ? STEPS[stepId] : null;
  const dockText = step
    ? phase === 'running'
      ? step.running
      : phase === 'done'
      ? step.done
      : notice ?? coach ?? step.hint
    : '';
  const TaskIntro = taskPage?.Intro;

  return (
    <>
      {page === 'planet' && stepId === 'selectPlanet' && <PlanetHalo ui={uiManager} />}
      <Panel
        ref={panelRef}
        style={{
          left: position.x,
          top: position.y,
          maxHeight: `calc(100% - ${position.y}px - 16px)`,
        }}
      >
        <DragBar
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        >
          <span>{pageTitle(page)}</span>
          <Btn size='small' onClick={resetToCover}>
            Back to start
          </Btn>
        </DragBar>
        <Body>
          {page === 'cover' && <CoverCopy onStart={() => open('planet', 'zoom')} />}
          {page === 'play' && <PlayCopy />}
          {taskPage && TaskIntro && stepId && (
            <>
              <TaskIntro />
              <StepList>
                {taskPage.steps.map((id, index) => (
                  <li key={id}>
                    <StepButton
                      type='button'
                      tabIndex={-1}
                      $current={id === stepId}
                      onClick={() => open(page, id)}
                    >
                      {index + 1}. {STEPS[id].label}
                    </StepButton>
                  </li>
                ))}
              </StepList>
            </>
          )}
        </Body>
        {taskPage && step && (
          <Dock>
            {page === 'planet' && stepId === 'selectPlanet' && phase === 'done' && (
              <CompleteCelebration>
                <span aria-hidden='true' />
                <div>
                  <div>Page 1 complete.</div>
                  <div>Next page in {pageCountdown ?? PAGE_HOLD_MS / 1000}s.</div>
                </div>
              </CompleteCelebration>
            )}
            {page === 'move' && stepId === 'clickNearby' && phase === 'done' && (
              <CompleteCelebration>
                <span aria-hidden='true' />
                <div>
                  <div>Page 2 complete.</div>
                  <div>Next page in {pageCountdown ?? PAGE_HOLD_MS / 1000}s.</div>
                </div>
              </CompleteCelebration>
            )}
            {page === 'fog' && stepId === 'clickDark' && phase === 'done' && (
              <CompleteCelebration>
                <span aria-hidden='true' />
                <div>
                  <div>Great, you did it.</div>
                  <div>Next page in {pageCountdown ?? PAGE_HOLD_MS / 1000}s.</div>
                </div>
              </CompleteCelebration>
            )}
            <DockStatus $done={phase === 'done'}>{dockText}</DockStatus>
            {phase === 'waiting' && (
              <BrightAction>
                <p>{step.assistLead ?? 'We can do this part:'}</p>
                <Btn size='stretch' onClick={runAssist}>
                  {step.button}
                </Btn>
              </BrightAction>
            )}
          </Dock>
        )}
        {(previous || (next && page !== 'cover')) && (
          <PageNav>
            {previous ? (
              <Btn onClick={() => open(previous, firstStep(previous))}>Previous</Btn>
            ) : (
              <span />
            )}
            {next && page !== 'cover' ? (
              <Btn onClick={() => open(next, firstStep(next))}>Next</Btn>
            ) : (
              <span />
            )}
          </PageNav>
        )}
      </Panel>
    </>
  );
}
