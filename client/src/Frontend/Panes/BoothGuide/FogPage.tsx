import { CursorState, ModalManagerEvent } from '@dfares/types';
import React from 'react';
import GameUIManager from '../../../Backend/GameLogic/GameUIManager';
import type { AssistHooks, GuidePage, StepCopy, StepId, WatchHooks } from './BoothGuidePane';
import { findOnScreenDarkPatch } from './BoothGuidePane';

const copy: Record<'pressExplore' | 'clickDark', StepCopy> = {
  pressExplore: {
    label: 'Press Move on the bottom-left explorer',
    hint: 'With nothing selected, press Move on the explorer at the bottom left.',
    button: 'Press Move',
    assistLead: 'We can arm the explorer:',
    running: 'Arming the explorer.',
    done: 'Move is armed. The next click chooses where to explore.',
  },
  clickDark: {
    label: 'Click a dark patch of the map',
    hint: 'Click a dark patch on the screen. The white explorer target moves there, and mining continues from that spot. Coordinates stay hidden until you find them yourself.',
    button: 'Mine somewhere else',
    assistLead: 'We can mine somewhere else on screen:',
    running: 'Moving the explorer to another dark patch on screen.',
    done: 'Great, you did it. The explorer is mining that dark patch.',
  },
};

function FogIntro() {
  return <p>Send your explorer into a dark part of the map.</p>;
}

function openFog(ui: GameUIManager, step: StepId): void {
  if (step !== 'clickDark') return;
  ui.getModalManager().setCursorState(CursorState.TargetingExplorer);
}

function watchFog(hooks: WatchHooks): () => void {
  const { ui, stepId, finish } = hooks;
  const modal = ui.getModalManager();

  if (stepId === 'pressExplore') {
    const onCursor = (state: CursorState) => {
      if (state === CursorState.TargetingExplorer) finish();
    };
    modal.on(ModalManagerEvent.StateChanged, onCursor);
    return () => modal.removeListener(ModalManagerEvent.StateChanged, onCursor);
  }

  if (stepId !== 'clickDark') return () => {};

  const onTarget = () => finish();
  modal.on(ModalManagerEvent.MiningCoordsUpdate, onTarget);
  return () => modal.removeListener(ModalManagerEvent.MiningCoordsUpdate, onTarget);
}

async function assistFog(hooks: AssistHooks): Promise<void> {
  const { ui, stepId } = hooks;
  if (stepId === 'pressExplore') {
    ui.getModalManager().setCursorState(CursorState.TargetingExplorer);
    return;
  }
  if (stepId !== 'clickDark') return;
  const coords = findOnScreenDarkPatch(ui);
  if (!coords) throw new Error('No dark patch found on screen.');
  const modal = ui.getModalManager();
  modal.setCursorState(CursorState.TargetingExplorer);
  modal.acceptInputForTarget({
    x: Math.floor(coords.x),
    y: Math.floor(coords.y),
  });
}

export const fogPage: GuidePage = {
  id: 'fog',
  steps: ['pressExplore', 'clickDark'],
  copy,
  Intro: FogIntro,
  open: openFog,
  watch: watchFog,
  assist: assistFog,
};
