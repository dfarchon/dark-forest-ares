import { isLocatable } from '@dfares/gamelogic';
import { LocatablePlanet } from '@dfares/types';
import React from 'react';
import GameUIManager from '../../../Backend/GameLogic/GameUIManager';
import Viewport from '../../Game/Viewport';
import UIEmitter, { UIEmitterEvent } from '../../Utils/UIEmitter';
import type { AssistHooks, GuidePage, StepCopy, StepId, WatchHooks } from './BoothGuidePane';
import {
  SEND_PERCENT,
  SLIDER_ASIDE,
  armSend,
  moveDestinationKey,
  pickTarget,
  sendFleet,
  sourcePlanet,
} from './BoothGuidePane';

const copy: Record<'selectMovePlanet' | 'setEnergy' | 'pressSend' | 'clickNearby', StepCopy> = {
  selectMovePlanet: {
    label: 'Select one of your planets',
    hint: 'Click the planet with the pink ring.',
    button: 'Select my planet',
    assistLead: 'We can select one for you:',
    running: 'Selecting one of your planets.',
    done: 'This planet will send the energy.',
  },
  setEnergy: {
    label: 'Choose how much energy to send',
    hint: 'Increase the slider until there is enough energy to reach a nearby planet.',
    button: 'Choose an amount for me',
    assistLead: 'We can choose an amount:',
    running: 'Choosing an amount to send.',
    done: 'That amount is ready to send.',
  },
  pressSend: {
    label: 'Press Send',
    hint: 'Press Send on your planet.',
    button: 'Press Send',
    assistLead: 'We can press Send:',
    running: 'Pressing Send.',
    done: 'Send is armed. The next click chooses a planet.',
  },
  clickNearby: {
    label: 'Click a nearby planet',
    hint: 'Click a nearby planet with a pink ring.',
    button: 'Send to a nearby planet',
    assistLead: 'We can send it for you:',
    running: 'Sending energy to a nearby planet.',
    done: 'A dotted line is a fleet still in flight or waiting to confirm. A solid line has already left.',
  },
};

const PENDING_DESTINATION = '__booth-guide-pending-destination__';

function MoveIntro() {
  return <p>Select a planet, then send its energy to another planet.</p>;
}

function selectedMovePlanet(ui: GameUIManager): LocatablePlanet | undefined {
  const selected = ui.getSelectedPlanet();
  if (selected && isLocatable(selected) && ui.isOwnedByMe(selected) && selected.energy > 1) {
    return selected;
  }
  return undefined;
}

function moveSourcePlanet(ui: GameUIManager): LocatablePlanet | undefined {
  return selectedMovePlanet(ui) ?? sourcePlanet(ui);
}

function canReachNearbyPlanet(ui: GameUIManager, from: LocatablePlanet, percent: number): boolean {
  return Boolean(pickTarget(ui, from, false, percent));
}

function sufficientSendPercent(ui: GameUIManager, from: LocatablePlanet): number | undefined {
  if (canReachNearbyPlanet(ui, from, SEND_PERCENT)) return SEND_PERCENT;
  for (let percent = SEND_PERCENT + 5; percent <= 95; percent += 5) {
    if (canReachNearbyPlanet(ui, from, percent)) return percent;
  }
  return canReachNearbyPlanet(ui, from, 98) ? 98 : undefined;
}

function ownedEnergyPlanets(ui: GameUIManager): LocatablePlanet[] {
  return ui
    .getGameManager()
    .getMyPlanets()
    .filter(
      (planet): planet is LocatablePlanet =>
        isLocatable(planet) && ui.isOwnedByMe(planet) && planet.energy > 1
    );
}

const VIEW_RIM = 0.75;

function viewPlacement(planet: LocatablePlanet): { rim: number; center: number } {
  const viewport = Viewport.getInstance();
  const center = viewport.getViewportPosition();
  const halfW = viewport.getViewportWorldWidth() / 2;
  const halfH = viewport.getViewportWorldHeight() / 2;
  if (halfW <= 0 || halfH <= 0) return { rim: 0, center: 0 };
  const nx = Math.abs(planet.location.coords.x - center.x) / halfW;
  const ny = Math.abs(planet.location.coords.y - center.y) / halfH;
  return { rim: Math.max(nx, ny), center: Math.hypot(nx, ny) };
}

export function guideMovePlanet(ui: GameUIManager): LocatablePlanet | undefined {
  const placed = ownedEnergyPlanets(ui).map((planet) => ({ planet, ...viewPlacement(planet) }));
  const inner = placed.filter((item) => item.rim <= VIEW_RIM);
  const pool = (inner.length > 0 ? inner : placed).slice();
  pool.sort(
    (a, b) =>
      a.center - b.center ||
      b.planet.energy - a.planet.energy ||
      a.planet.locationId.localeCompare(b.planet.locationId)
  );
  return pool[0]?.planet;
}

function planetsInSendRange(
  ui: GameUIManager,
  from: LocatablePlanet,
  percent: number
): LocatablePlanet[] {
  try {
    return ui
      .getGameManager()
      .getPlanetsInRange(from.locationId, percent, false)
      .filter(
        (planet): planet is LocatablePlanet =>
          isLocatable(planet) && planet.locationId !== from.locationId
      );
  } catch {
    return [];
  }
}

function gameCanvas(): HTMLCanvasElement | null {
  const list = document.querySelectorAll('canvas:not(#buffer)');
  const canvas = list.item(1) ?? list.item(0);
  return canvas instanceof HTMLCanvasElement ? canvas : null;
}

function planetScreenSpot(
  ui: GameUIManager,
  planet: LocatablePlanet
): { x: number; y: number; radius: number } | null {
  let viewport: Viewport;
  try {
    viewport = Viewport.getInstance();
  } catch {
    return null;
  }
  const canvas = gameCanvas();
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const local = viewport.worldToCanvasCoords(planet.location.coords);
  const scale = canvas.width > 0 ? rect.width / canvas.width : 1;
  const rad = Math.max(ui.getRadiusOfPlanetLevel(planet.planetLevel), 1);
  return {
    x: rect.left + local.x * scale,
    y: rect.top + local.y * (canvas.height > 0 ? rect.height / canvas.height : 1),
    radius: Math.max(viewport.worldToCanvasDist(rad) * scale, 10),
  };
}

function underGuidePanel(ui: GameUIManager, planet: LocatablePlanet): boolean {
  const panel = document.querySelector('[data-booth-panel]');
  if (!(panel instanceof HTMLElement)) return false;
  const panelRect = panel.getBoundingClientRect();
  if (panelRect.width < 2 || panelRect.height < 2) return false;
  const spot = planetScreenSpot(ui, planet);
  if (!spot) return false;
  const pad = 16;
  const left = panelRect.left - pad;
  const right = panelRect.right + pad;
  const top = panelRect.top - pad;
  const bottom = panelRect.bottom + pad;
  const x = Math.max(left, Math.min(spot.x, right));
  const y = Math.max(top, Math.min(spot.y, bottom));
  return (spot.x - x) ** 2 + (spot.y - y) ** 2 <= spot.radius ** 2;
}

function guideNearbyPlanet(
  ui: GameUIManager,
  from: LocatablePlanet,
  percent: number
): LocatablePlanet | undefined {
  const onScreen = planetsInSendRange(ui, from, percent)
    .map((planet) => ({ planet, ...viewPlacement(planet) }))
    .filter((item) => item.rim <= 1);
  if (onScreen.length === 0) return pickTarget(ui, from, false, percent);
  const clear = onScreen.filter((item) => !underGuidePanel(ui, item.planet));
  const pool = clear.length > 0 ? clear : onScreen;
  pool.sort(
    (a, b) => a.center - b.center || a.planet.locationId.localeCompare(b.planet.locationId)
  );
  return pool[0].planet;
}

export function moveHaloPlanets(ui: GameUIManager, stepId: StepId): LocatablePlanet[] {
  if (stepId === 'selectMovePlanet') {
    const planet = guideMovePlanet(ui);
    return planet ? [planet] : [];
  }
  if (stepId !== 'clickNearby') return [];
  const from = selectedMovePlanet(ui);
  if (!from) return [];
  const percent = ui.getForcesSending(from.locationId);
  const reach =
    percent !== SLIDER_ASIDE && canReachNearbyPlanet(ui, from, percent)
      ? percent
      : sufficientSendPercent(ui, from);
  if (reach === undefined) return [];
  const planet = guideNearbyPlanet(ui, from, reach);
  return planet ? [planet] : [];
}

function openMove(ui: GameUIManager, step: StepId): void {
  if (step === 'selectMovePlanet') return;
  if (step === 'setEnergy' || step === 'pressSend') {
    const from = moveSourcePlanet(ui);
    if (!from) return;
    ui.setSelectedPlanet(from);
    if (step === 'setEnergy') ui.setForcesSending(from.locationId, SLIDER_ASIDE);
    return;
  }
  if (step !== 'clickNearby') return;
  const from = moveSourcePlanet(ui);
  if (!from) return;
  ui.setSelectedPlanet(from);
  armSend(ui, from);
}

function watchMove(hooks: WatchHooks): () => void {
  const { ui, stepId, finish, reject, notify, isSettled, moveSeen } = hooks;

  if (stepId === 'selectMovePlanet') {
    let ready = false;
    const sub = ui.selectedPlanetId$.subscribe((id) => {
      if (!ready || !id) return;
      const planet = ui.getPlanetWithId(id);
      if (planet && isLocatable(planet) && ui.isOwnedByMe(planet) && planet.energy > 1) {
        finish();
        return;
      }
      if (!isSettled()) notify('Select one of your planets that still has energy.');
    });
    ready = true;
    return () => sub.unsubscribe();
  }

  if (stepId === 'setEnergy') {
    let lastPercent = SLIDER_ASIDE;
    const sub = ui
      .getGameManager()
      .getGameObjects()
      .planetUpdated$.subscribe((id) => {
        const selected = ui.getSelectedPlanet();
        if (!selected || id !== selected.locationId) return;
        const percent = ui.getForcesSending(id);
        if (percent === lastPercent) return;
        lastPercent = percent;
        const from = moveSourcePlanet(ui);
        if (from && canReachNearbyPlanet(ui, from, percent)) {
          finish();
          return;
        }
        if (!isSettled()) {
          notify('That is not enough energy to reach a nearby planet. Increase the slider.');
        }
      });
    return () => sub.unsubscribe();
  }

  if (stepId === 'pressSend') {
    let ready = false;
    const sub = ui.isSending$.subscribe((sending) => {
      if (!ready || !sending) return;
      finish();
    });
    ready = true;
    return () => sub.unsubscribe();
  }

  if (stepId !== 'clickNearby') return () => {};

  const from = moveSourcePlanet(ui);
  const sourceId = from?.locationId;
  const key = moveDestinationKey(ui);
  localStorage.setItem(key, PENDING_DESTINATION);
  moveSeen.current = PENDING_DESTINATION;
  const onSent = (sentFromId?: string) => {
    if (isSettled()) return;
    if (sourceId && sentFromId && sentFromId !== sourceId) return;
    const toId = localStorage.getItem(key);
    if (!toId || toId === PENDING_DESTINATION) {
      reject('The move was not sent. Increase the energy or choose a planet in range.');
      return;
    }
    moveSeen.current = toId;
    finish();
  };
  const uiEmitter = UIEmitter.getInstance();
  uiEmitter.on(UIEmitterEvent.SendCompleted, onSent);
  return () => uiEmitter.removeListener(UIEmitterEvent.SendCompleted, onSent);
}

async function assistMove(hooks: AssistHooks): Promise<void> {
  const { ui, stepId, finish, isCurrent } = hooks;
  if (stepId === 'selectMovePlanet') {
    const from = guideMovePlanet(ui);
    if (!from) throw new Error('Your planet is not on the map yet.');
    ui.setSelectedPlanet(from);
    finish();
    return;
  }
  if (stepId === 'setEnergy') {
    const from = moveSourcePlanet(ui);
    if (!from) throw new Error('Your planet is not on the map yet.');
    const percent = sufficientSendPercent(ui, from);
    if (percent === undefined) throw new Error('No nearby planet can be reached from here.');
    ui.setSelectedPlanet(from);
    ui.setForcesSending(from.locationId, percent);
    finish();
    return;
  }
  if (stepId === 'pressSend') {
    const from = moveSourcePlanet(ui);
    if (!from) throw new Error('Your planet is not on the map yet.');
    if (ui.getSelectedPlanet()?.locationId !== from.locationId) {
      ui.setSelectedPlanet(from);
    }
    if (ui.getForcesSending(from.locationId) === SLIDER_ASIDE) {
      ui.setForcesSending(from.locationId, SEND_PERCENT);
    }
    armSend(ui, from);
    return;
  }
  if (stepId !== 'clickNearby') return;

  const from = moveSourcePlanet(ui);
  if (!from) throw new Error('Your planet is not on the map yet.');
  const percent = ui.getForcesSending(from.locationId);
  const sending = percent === SLIDER_ASIDE ? SEND_PERCENT : percent;
  if (sending !== percent) ui.setForcesSending(from.locationId, sending);
  const target = guideNearbyPlanet(ui, from, sending);
  if (!target) throw new Error('No planet in range from here.');
  if (ui.getSelectedPlanet()?.locationId !== from.locationId || !ui.isSendingForces()) {
    ui.setSelectedPlanet(from);
    armSend(ui, from);
  }
  await sendFleet(ui, from, target);
  if (!isCurrent()) return;
  UIEmitter.getInstance().emit(UIEmitterEvent.SendCompleted, from.locationId);
}

export const movePage: GuidePage = {
  id: 'move',
  steps: ['selectMovePlanet', 'setEnergy', 'pressSend', 'clickNearby'],
  copy,
  Intro: MoveIntro,
  open: openMove,
  watch: watchMove,
  assist: assistMove,
};
