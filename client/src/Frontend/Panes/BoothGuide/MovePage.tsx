import { isLocatable } from '@dfares/gamelogic';
import { LocatablePlanet } from '@dfares/types';
import React from 'react';
import GameUIManager from '../../../Backend/GameLogic/GameUIManager';
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
    hint: 'Click one of your planets that has energy.',
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
    hint: 'Zoom and move the map until you find a target planet, then click it to send the energy.',
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

function moveSourcePlanet(ui: GameUIManager): LocatablePlanet | undefined {
  const selected = ui.getSelectedPlanet();
  if (selected && isLocatable(selected) && ui.isOwnedByMe(selected) && selected.energy > 1) {
    return selected;
  }
  return sourcePlanet(ui);
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
    const from = sourcePlanet(ui);
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
  const target = pickTarget(ui, from, false, sending);
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
