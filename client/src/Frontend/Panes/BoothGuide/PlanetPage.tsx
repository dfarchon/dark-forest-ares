import { LocatablePlanet } from '@dfares/types';
import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import GameUIManager from '../../../Backend/GameLogic/GameUIManager';
import Viewport from '../../Game/Viewport';
import dfstyles from '../../Styles/dfstyles';
import UIEmitter, { UIEmitterEvent } from '../../Utils/UIEmitter';
import type { AssistHooks, GuidePage, StepCopy, StepId, WatchHooks } from './BoothGuidePane';
import {
  approachPlanetFrame,
  focusHome,
  planetNearCenter,
  scrolledOutFully,
  sourcePlanet,
  universeFrame,
  universeOnScreen,
} from './BoothGuidePane';

const ZOOM_MAXED = 'Drag toward the center of the map. This is as far as the screen zooms out.';
const SELECT_MISS = 'That planet does not count. Click one you own that still has energy.';

const copy: Record<'zoom' | 'zoomIn' | 'selectPlanet', StepCopy> = {
  zoom: {
    label: 'Scroll until the whole universe is on screen',
    hint: 'Keep scrolling down. The universe is still bigger than the screen.',
    button: 'Show the whole universe',
    assistLead: 'Want the full view now:',
    running: 'Opening the view to the whole universe.',
    done: 'This is the whole universe.',
  },
  zoomIn: {
    label: 'Zoom in until your planets fill the screen',
    hint: '1. Hold the left mouse button on empty space.\n2. Drag the map until your planet is in the center.\n3. Scroll up until the screen mostly shows your planets.',
    button: 'Zoom to my planet',
    assistLead: 'We can bring it to the center:',
    running: 'Bringing your planet to the center.',
    done: 'Your planets fill the screen.',
  },
  selectPlanet: {
    label: 'Select one of your planets that has energy',
    hint: 'Left-click the planet with the pink ring.',
    button: 'Select my planet',
    assistLead: 'We can select it for you:',
    running: 'Selecting a planet of yours that has energy.',
    done: 'That planet is yours, and it has energy.',
  },
};

function PlanetIntro() {
  return <p>See how big the universe is, then find your own planet.</p>;
}

function openPlanet(ui: GameUIManager, step: StepId): void {
  if (step === 'zoom') focusHome(ui);
}

function watchPlanet(hooks: WatchHooks): () => void {
  const { ui, stepId, finish, notify, showCoach, releaseTour, stopTour, isSettled, isRunning } =
    hooks;
  const uiEmitter = UIEmitter.getInstance();

  if (stepId === 'zoom') {
    const settleIfSeen = () => {
      if (!universeOnScreen(ui)) return false;
      stopTour();
      finish();
      return true;
    };
    const coachNow = () => {
      showCoach(!universeOnScreen(ui) && scrolledOutFully() ? ZOOM_MAXED : null);
    };
    const onScroll = () => {
      if (isSettled()) return;
      if (settleIfSeen()) return;
      coachNow();
      releaseTour();
    };
    const onUp = () => {
      if (isSettled() || isRunning()) return;
      if (settleIfSeen()) return;
      coachNow();
    };
    coachNow();
    uiEmitter.on(UIEmitterEvent.CanvasScroll, onScroll);
    uiEmitter.on(UIEmitterEvent.WorldMouseUp, onUp);
    return () => {
      uiEmitter.removeListener(UIEmitterEvent.CanvasScroll, onScroll);
      uiEmitter.removeListener(UIEmitterEvent.WorldMouseUp, onUp);
    };
  }

  if (stepId === 'zoomIn') {
    const settleIfCentered = () => {
      if (!planetNearCenter(ui)) return false;
      finish();
      return true;
    };
    const onScroll = () => {
      if (isSettled() || isRunning()) return;
      settleIfCentered();
    };
    const onUp = () => {
      if (isSettled() || isRunning()) return;
      settleIfCentered();
    };
    uiEmitter.on(UIEmitterEvent.CanvasScroll, onScroll);
    uiEmitter.on(UIEmitterEvent.WorldMouseUp, onUp);
    return () => {
      uiEmitter.removeListener(UIEmitterEvent.CanvasScroll, onScroll);
      uiEmitter.removeListener(UIEmitterEvent.WorldMouseUp, onUp);
    };
  }

  if (stepId === 'selectPlanet') {
    let ready = false;
    const sub = ui.selectedPlanetId$.subscribe((id) => {
      if (!ready || !id) return;
      const planet = ui.getPlanetWithId(id);
      if (planet && ui.isOwnedByMe(planet) && planet.energy > 0) {
        finish();
        return;
      }
      if (isSettled()) return;
      notify(SELECT_MISS);
    });
    ready = true;
    return () => sub.unsubscribe();
  }

  return () => {};
}

async function assistPlanet(hooks: AssistHooks): Promise<void> {
  const { ui, stepId, finish, isDone, playReveal, playApproach } = hooks;
  if (stepId === 'zoom') {
    playReveal(universeFrame(ui, Viewport.getInstance()), finish);
    return;
  }
  if (stepId === 'zoomIn') {
    playApproach(approachPlanetFrame(ui), finish);
    return;
  }
  if (stepId !== 'selectPlanet') return;
  const planet = sourcePlanet(ui);
  if (!planet) throw new Error('Your planet is not on the map yet.');
  ui.setSelectedPlanet(planet);
  ui.centerPlanet(planet);
  if (isDone()) return;
  if (!ui.isOwnedByMe(planet) || planet.energy <= 0) {
    throw new Error('Click a planet you own that still has energy.');
  }
}

const HaloCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  z-index: 4;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

export function PlanetHalo({
  ui,
  planets,
}: {
  ui: GameUIManager;
  planets: () => LocatablePlanet[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const planetsRef = useRef(planets);
  planetsRef.current = planets;

  useEffect(() => {
    let frame = 0;
    let stopped = false;
    const draw = (now: number) => {
      if (stopped) return;
      const canvas = ref.current;
      if (canvas) {
        const parent = canvas.parentElement;
        const width = parent?.clientWidth ?? 0;
        const height = parent?.clientHeight ?? 0;
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx && width > 0 && height > 0) {
          ctx.clearRect(0, 0, width, height);
          const viewport = Viewport.getInstance();
          const pulse = 1.45 + 0.28 * Math.sin(now / 280);
          ctx.strokeStyle = dfstyles.colors.dfpink;
          ctx.lineWidth = 3;
          for (const planet of planetsRef.current()) {
            const point = viewport.worldToCanvasCoords(planet.location.coords);
            const rad = Math.max(ui.getRadiusOfPlanetLevel(planet.planetLevel), 1);
            const screenRad = Math.max(viewport.worldToCanvasDist(rad), 10);
            ctx.beginPath();
            ctx.arc(point.x, point.y, screenRad * pulse, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [ui]);

  return <HaloCanvas ref={ref} />;
}

export const planetPage: GuidePage = {
  id: 'planet',
  steps: ['zoom', 'zoomIn', 'selectPlanet'],
  copy,
  Intro: PlanetIntro,
  open: openPlanet,
  watch: watchPlanet,
  assist: assistPlanet,
};
