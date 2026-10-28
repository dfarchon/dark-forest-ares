import type { LocatablePlanet, WorldCoords } from '@dfares/types';
import React, { useEffect, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import type GameUIManager from '../../../Backend/GameLogic/GameUIManager';
import Viewport from '../../Game/Viewport';
import dfstyles from '../../Styles/dfstyles';
import type { PageId, StepId } from './BoothGuidePane';

const PINK = dfstyles.colors.dfpink;
const CURSOR_W = 86;
const CURSOR_H = 99;
const DRAG_MS = 1600;
const SCROLL_AFTER_MS = 1400;

type Point = { x: number; y: number };

type Pose =
  | { kind: 'hide' }
  | { kind: 'click'; at: Point }
  | { kind: 'scroll'; at: Point; direction: 'up' | 'down' }
  | { kind: 'drag'; from: Point; to: Point; thenScroll?: 'up' };

export type GuideMouseProps = {
  ui: GameUIManager;
  page: PageId;
  stepId: StepId;
  panelRef: { readonly current: HTMLElement | null };
  planets: () => LocatablePlanet[];
  focusPlanet: () => LocatablePlanet | undefined;
  darkPatch: () => WorldCoords | undefined;
  zoomNeedsDrag: () => boolean;
};

const pressAnim = keyframes`
  0%, 46% { transform: none; }
  58% { transform: translate(6px, 8px) scale(0.94); }
  74%, 100% { transform: none; }
`;

const rippleAnim = keyframes`
  0%, 42% { opacity: 0; transform: scale(0.3); }
  60% { opacity: 0.85; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.8); }
`;

const chevronDown = keyframes`
  0%, 100% { transform: translateY(0); opacity: 0.4; }
  50% { transform: translateY(10px); opacity: 1; }
`;

const chevronUp = keyframes`
  0%, 100% { transform: translateY(0); opacity: 0.4; }
  50% { transform: translateY(-10px); opacity: 1; }
`;

const Layer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100000;
  overflow: visible;
  pointer-events: none;
`;

const Cursor = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  will-change: transform;
`;

const Shift = styled.div`
  position: relative;
  width: 0;
  height: 0;

  &[data-gesture='click'] {
    animation: ${pressAnim} 1.35s ease-in-out infinite;
  }
`;

const Pointer = styled.svg`
  display: block;
  overflow: visible;
  filter: drop-shadow(0 0 10px ${PINK}) drop-shadow(0 2px 2px rgba(0, 0, 0, 0.55));
`;

const Ripple = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  display: none;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border: 2px solid ${PINK};
  border-radius: 50%;

  ${Shift}[data-gesture='click'] & {
    display: block;
    animation: ${rippleAnim} 1.35s ease-out infinite;
  }
`;

const Chevrons = styled.div`
  position: absolute;
  top: 3px;
  left: 59px;
  display: none;

  svg {
    display: block;
  }

  &[data-dir='up'] svg {
    transform: rotate(180deg);
  }

  &[data-dir='down'] {
    animation: ${chevronDown} 0.9s ease-in-out infinite;
  }

  &[data-dir='up'] {
    animation: ${chevronUp} 0.9s ease-in-out infinite;
  }

  ${Shift}[data-gesture='scroll'] & {
    display: block;
  }
`;

function tryViewport(): Viewport | undefined {
  try {
    return Viewport.getInstance();
  } catch {
    return undefined;
  }
}

function gameCanvas(): HTMLCanvasElement | null {
  const list = document.querySelectorAll('canvas:not(#buffer)');
  const canvas = list.item(1) ?? list.item(0);
  return canvas instanceof HTMLCanvasElement ? canvas : null;
}

function canvasRect(): DOMRect | null {
  const canvas = gameCanvas();
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return rect;
}

function worldToClient(world: WorldCoords): Point | null {
  const viewport = tryViewport();
  const canvas = gameCanvas();
  if (!viewport || !canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const local = viewport.worldToCanvasCoords(world);
  const scaleX = canvas.width > 0 ? rect.width / canvas.width : 1;
  const scaleY = canvas.height > 0 ? rect.height / canvas.height : 1;
  return { x: rect.left + local.x * scaleX, y: rect.top + local.y * scaleY };
}

function inside(rect: DOMRect, point: Point, slop = 0): boolean {
  return (
    point.x >= rect.left - slop &&
    point.x <= rect.right + slop &&
    point.y >= rect.top - slop &&
    point.y <= rect.bottom + slop
  );
}

function clampToRect(point: Point, rect: DOMRect, inset: number): Point {
  return {
    x: Math.min(rect.right - inset, Math.max(rect.left + inset, point.x)),
    y: Math.min(rect.bottom - inset, Math.max(rect.top + inset, point.y)),
  };
}

function overlapsPanel(panel: HTMLElement | null, x: number, y: number): boolean {
  if (!panel) return false;
  const rect = panel.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  return x < rect.right && x + CURSOR_W > rect.left && y < rect.bottom && y + CURSOR_H > rect.top;
}

function smoothstep(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

function scrollAnchor(panel: HTMLElement | null): Point | null {
  const rect = canvasRect();
  if (!rect) return null;
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  if (!overlapsPanel(panel, center.x, center.y)) return center;
  const panelRect = panel?.getBoundingClientRect();
  const candidates = panelRect
    ? [
        { x: panelRect.right + 28, y: center.y },
        { x: center.x, y: panelRect.bottom + 28 },
        { x: rect.left + rect.width * 0.72, y: rect.top + rect.height * 0.62 },
      ]
    : [];
  for (const candidate of candidates) {
    const clamped = clampToRect(candidate, rect, 48);
    if (inside(rect, clamped, 0) && !overlapsPanel(panel, clamped.x, clamped.y)) return clamped;
  }
  return center;
}

function nudgeOffPanel(
  from: Point,
  to: Point,
  panel: HTMLElement | null,
  rect: DOMRect
): { from: Point; to: Point } {
  if (!panel) return { from, to };
  if (!overlapsPanel(panel, from.x, from.y) && !overlapsPanel(panel, to.x, to.y))
    return { from, to };
  const panelRect = panel.getBoundingClientRect();
  const shiftX = panelRect.right + 28 - Math.min(from.x, to.x);
  if (shiftX > 0 && Math.max(from.x, to.x) + shiftX < rect.right - 36) {
    return { from: { x: from.x + shiftX, y: from.y }, to: { x: to.x + shiftX, y: to.y } };
  }
  const shiftY = panelRect.bottom + 28 - Math.min(from.y, to.y);
  if (shiftY > 0 && Math.max(from.y, to.y) + shiftY < rect.bottom - 36) {
    return { from: { x: from.x, y: from.y + shiftY }, to: { x: to.x, y: to.y + shiftY } };
  }
  return { from, to };
}

function dragTowardMapCenter(panel: HTMLElement | null): { from: Point; to: Point } | null {
  const rect = canvasRect();
  const origin = worldToClient({ x: 0, y: 0 });
  if (!rect || !origin) return null;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = origin.x - cx;
  let dy = origin.y - cy;
  if (Math.hypot(dx, dy) < 30) {
    dx = -1;
    dy = -0.35;
  }
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const travel = 130;
  const to = clampToRect({ x: cx + ux * travel * 0.5, y: cy + uy * travel * 0.5 }, rect, 40);
  const from = clampToRect({ x: to.x - ux * travel, y: to.y - uy * travel }, rect, 40);
  return nudgeOffPanel(from, to, panel, rect);
}

function emptyStart(target: Point, rect: DOMRect, panel: HTMLElement | null): Point | null {
  const inset = Math.min(120, rect.width * 0.18, rect.height * 0.18);
  const xs = [rect.left + inset, rect.left + rect.width / 2, rect.right - inset];
  const ys = [rect.top + inset, rect.top + rect.height / 2, rect.bottom - inset];
  let bestClear: Point | null = null;
  let bestClearD = 80 * 80;
  let bestAny: Point | null = null;
  let bestAnyD = -1;
  for (const x of xs) {
    for (const y of ys) {
      const point = { x, y };
      if (!inside(rect, point, 0)) continue;
      const dist = (x - target.x) ** 2 + (y - target.y) ** 2;
      if (dist > bestAnyD) {
        bestAnyD = dist;
        bestAny = point;
      }
      if (!overlapsPanel(panel, x, y) && dist > bestClearD) {
        bestClearD = dist;
        bestClear = point;
      }
    }
  }
  return bestClear ?? bestAny;
}

function dragTowardPlanet(
  planet: LocatablePlanet,
  panel: HTMLElement | null
): { from: Point; to: Point } | null {
  const rect = canvasRect();
  const center = worldToClient(planet.location.coords);
  if (!rect || !center) return null;
  const from = emptyStart(center, rect, panel);
  if (!from) return null;
  const dx = center.x - from.x;
  const dy = center.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  let travel = Math.min(150, Math.max(90, len * 0.4));
  let to = clampToRect(
    { x: from.x + (dx / len) * travel, y: from.y + (dy / len) * travel },
    rect,
    36
  );
  while (travel > 48 && overlapsPanel(panel, to.x, to.y)) {
    travel -= 18;
    to = clampToRect(
      { x: from.x + (dx / len) * travel, y: from.y + (dy / len) * travel },
      rect,
      36
    );
  }
  return { from, to };
}

function planetTip(ui: GameUIManager, planet: LocatablePlanet): Point | null {
  const viewport = tryViewport();
  const canvas = gameCanvas();
  const center = worldToClient(planet.location.coords);
  if (!viewport || !canvas || !center) return null;
  const rect = canvas.getBoundingClientRect();
  if (!inside(rect, center, 0)) return null;
  const rad = Math.max(ui.getRadiusOfPlanetLevel(planet.planetLevel), 1);
  const scale = canvas.width > 0 ? rect.width / canvas.width : 1;
  const screenRad = Math.max(viewport.worldToCanvasDist(rad) * scale, 10);
  return clampToRect({ x: center.x + screenRad * 0.7, y: center.y + screenRad * 0.7 }, rect, 8);
}

function pickOnScreenPlanet(
  planets: LocatablePlanet[],
  nearest: boolean
): LocatablePlanet | undefined {
  const rect = canvasRect();
  if (!rect) return undefined;
  const visible = planets.filter((planet) => {
    const point = worldToClient(planet.location.coords);
    return point ? inside(rect, point, 0) : false;
  });
  if (visible.length === 0) return undefined;
  if (!nearest || visible.length === 1) return visible[0];
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let best = visible[0];
  let bestD = Infinity;
  for (const planet of visible) {
    const point = worldToClient(planet.location.coords);
    if (!point) continue;
    const dist = (point.x - cx) ** 2 + (point.y - cy) ** 2;
    if (dist < bestD) {
      bestD = dist;
      best = planet;
    }
  }
  return best;
}

function controlPoint(name: string): Point | null {
  const marker = document.querySelector(`[data-booth-target="${name}"]`);
  if (!(marker instanceof Element)) return null;
  const control = marker.querySelector('df-shortcut-button, df-button, button') ?? marker;
  const rect = control.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const at = {
    x: rect.left + Math.min(36, rect.width * 0.3),
    y: rect.top + rect.height * 0.45,
  };
  if (at.x < 0 || at.y < 0 || at.x > window.innerWidth || at.y > window.innerHeight) return null;
  return at;
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function resolvePose(
  props: GuideMouseProps,
  panel: HTMLElement | null,
  darkWorld: WorldCoords | undefined
): Pose {
  if (props.page !== 'planet' && props.page !== 'move' && props.page !== 'fog')
    return { kind: 'hide' };
  switch (props.stepId) {
    case 'zoom': {
      if (safe(() => props.zoomNeedsDrag())) {
        const drag = dragTowardMapCenter(panel);
        return drag ? { kind: 'drag', ...drag } : { kind: 'hide' };
      }
      const at = scrollAnchor(panel);
      return at ? { kind: 'scroll', at, direction: 'down' } : { kind: 'hide' };
    }
    case 'zoomIn': {
      const planet = safe(() => props.focusPlanet());
      if (!planet) return { kind: 'hide' };
      const drag = dragTowardPlanet(planet, panel);
      return drag ? { kind: 'drag', ...drag, thenScroll: 'up' } : { kind: 'hide' };
    }
    case 'selectPlanet':
    case 'selectMovePlanet':
    case 'clickNearby': {
      const planets = safe(() => props.planets()) ?? [];
      const planet = pickOnScreenPlanet(planets, props.stepId === 'clickNearby');
      if (!planet) return { kind: 'hide' };
      const at = planetTip(props.ui, planet);
      return at ? { kind: 'click', at } : { kind: 'hide' };
    }
    case 'setEnergy':
    case 'pressSend':
      return { kind: 'hide' };
    case 'pressExplore': {
      const at = controlPoint('explore-move');
      return at ? { kind: 'click', at } : { kind: 'hide' };
    }
    case 'clickDark': {
      if (!darkWorld) return { kind: 'hide' };
      const at = worldToClient(darkWorld);
      const rect = canvasRect();
      if (!at || !rect || !inside(rect, at, 0)) return { kind: 'hide' };
      return { kind: 'click', at };
    }
    default:
      return { kind: 'hide' };
  }
}

function dragSample(localMs: number, from: Point, to: Point): { at: Point; pressed: boolean } {
  const t = Math.min(1, Math.max(0, localMs / DRAG_MS));
  const pressed = t > 0.1 && t < 0.82;
  let u = 0;
  if (t >= 0.16 && t < 0.74) u = smoothstep((t - 0.16) / 0.58);
  else if (t >= 0.74) u = 1;
  return {
    at: { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u },
    pressed,
  };
}

function orient(pointer: SVGSVGElement, chevrons: HTMLDivElement, at: Point): void {
  const flipX = at.x + 69 > window.innerWidth - 8;
  const flipY = at.y + 96 > window.innerHeight - 8;
  pointer.style.transformOrigin = '0 0';
  pointer.style.transform = `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`;
  chevrons.style.left = flipX ? '-32px' : '59px';
  chevrons.style.top = flipY ? '6px' : '3px';
}

function place(
  cursor: HTMLDivElement,
  shift: HTMLDivElement,
  pointer: SVGSVGElement,
  chevrons: HTMLDivElement,
  pose: Pose,
  now: number,
  clockStart: number
): void {
  if (pose.kind === 'hide') {
    cursor.style.visibility = 'hidden';
    return;
  }

  let at = pose.kind === 'drag' ? pose.from : pose.at;
  let gesture: 'click' | 'scroll' | 'drag' = pose.kind === 'drag' ? 'drag' : pose.kind;
  let pressed = false;
  let direction: 'up' | 'down' = pose.kind === 'scroll' ? pose.direction : 'down';

  if (pose.kind === 'drag') {
    const elapsed = now - clockStart;
    if (pose.thenScroll) {
      const cycle = elapsed % (DRAG_MS + SCROLL_AFTER_MS);
      if (cycle >= DRAG_MS) {
        at = pose.to;
        gesture = 'scroll';
        direction = pose.thenScroll;
      } else {
        const sample = dragSample(cycle, pose.from, pose.to);
        at = sample.at;
        pressed = sample.pressed;
      }
    } else {
      const sample = dragSample(elapsed % DRAG_MS, pose.from, pose.to);
      at = sample.at;
      pressed = sample.pressed;
    }
  }

  cursor.style.visibility = 'visible';
  cursor.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
  shift.dataset.gesture = gesture;
  shift.style.transform = gesture === 'drag' && pressed ? 'translate(6px, 8px) scale(0.94)' : '';
  chevrons.dataset.dir = direction;
  orient(pointer, chevrons, at);
}

export function GuideMouse(props: GuideMouseProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const cursorRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<SVGSVGElement>(null);
  const chevronRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    const shift = shiftRef.current;
    const pointer = pointerRef.current;
    const chevrons = chevronRef.current;
    if (!cursor || !shift || !pointer || !chevrons) return;

    let frame = 0;
    let stopped = false;
    let clockKey = '';
    let clockStart = performance.now();
    let darkWorld: WorldCoords | undefined;
    let darkChecked = 0;

    const tick = (now: number) => {
      if (stopped) return;
      const current = propsRef.current;
      const zoomDrag = current.stepId === 'zoom' && Boolean(safe(() => current.zoomNeedsDrag()));
      const key = `${current.page}:${current.stepId}:${zoomDrag ? 'drag' : 'scroll'}`;
      if (key !== clockKey) {
        clockKey = key;
        clockStart = now;
      }
      if (current.stepId === 'clickDark' && now - darkChecked > 400) {
        darkWorld = safe(() => current.darkPatch());
        darkChecked = now;
      }
      const pose = resolvePose(current, current.panelRef.current, darkWorld);
      place(cursor, shift, pointer, chevrons, pose, now, clockStart);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <Layer aria-hidden='true'>
      <Cursor ref={cursorRef}>
        <Shift ref={shiftRef}>
          <Pointer ref={pointerRef} viewBox='0 0 64 92' width='62' height='88'>
            <path
              d='M1 1 L1 62 L16 48 L30 84 L42 78 L28 43 L52 43 Z'
              fill={PINK}
              stroke='#1a1014'
              strokeWidth='3'
              strokeLinejoin='miter'
            />
          </Pointer>
          <Ripple />
          <Chevrons ref={chevronRef}>
            <svg viewBox='0 0 24 32' width='22' height='29'>
              <path
                d='M4 4 L12 13 L20 4'
                fill='none'
                stroke={PINK}
                strokeWidth='3'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
              <path
                d='M4 16 L12 25 L20 16'
                fill='none'
                stroke={PINK}
                strokeWidth='3'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            </svg>
          </Chevrons>
        </Shift>
      </Cursor>
    </Layer>
  );
}
