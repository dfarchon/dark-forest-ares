import { GAME_VERSION_INTRO } from '@dfares/constants';
import React from 'react';
import styled, { css } from 'styled-components';
import dfstyles from '../Styles/dfstyles';

export type EntryModeChoice = 'quick' | 'standard' | 'terminal';

type Props = {
  onSelect: (mode: EntryModeChoice) => void;
  onConfigureQuickJoin?: () => void;
};

export function GameLandingEntryOverlay({ onSelect, onConfigureQuickJoin }: Props) {
  return (
    <Backdrop>
      <Card>
        <Title>Dark Forest Punk {GAME_VERSION_INTRO}</Title>
        <Subtitle>Choose how you want to sign in</Subtitle>
        <Hint>Pick one. You can refresh the page later to switch.</Hint>
        <ButtonCol>
          <PrimaryRow>
            <BigBtn type='button' $variant='primary' onClick={() => onSelect('quick')}>
              Quick join (auto)
            </BigBtn>
            {onConfigureQuickJoin ? (
              <GearBtn
                type='button'
                title='Quick join account settings'
                aria-label='Quick join account settings'
                onClick={onConfigureQuickJoin}
              >
                <GearIcon viewBox='0 0 24 24' aria-hidden>
                  <path
                    fill='currentColor'
                    d='M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z'
                  />
                </GearIcon>
              </GearBtn>
            ) : null}
          </PrimaryRow>
          <Desc>Fastest: auto-selects your default local wallet.</Desc>

          <BigBtn type='button' onClick={() => onSelect('standard')}>
            Standard (buttons + prompts)
          </BigBtn>
          <Desc>Guided clicks for wallet choices; terminal still shows status.</Desc>

          <BigBtn type='button' onClick={() => onSelect('terminal')}>
            Terminal (advanced)
          </BigBtn>
          <Desc>Classic typing flow: type numbers at the prompt and press Enter.</Desc>
        </ButtonCol>
      </Card>
    </Backdrop>
  );
}

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(6px);
`;

const Card = styled.div`
  width: min(440px, 100%);
  padding: 28px 24px 32px;
  border-radius: ${dfstyles.borderRadius};
  border: 1px solid ${dfstyles.colors.borderDarkest};
  background: rgba(21, 21, 21, 0.96);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
`;

const Title = styled.h2`
  margin: 0 0 8px;
  font-size: clamp(1.15rem, 3vw, 1.45rem);
  font-weight: 500;
  letter-spacing: 0.06em;
  color: ${dfstyles.colors.textLight};
  text-align: center;
`;

const Subtitle = styled.p`
  margin: 0 0 16px;
  font-size: 0.95rem;
  color: ${dfstyles.colors.subtext};
  text-align: center;
`;

const Hint = styled.p`
  margin: 0 0 22px;
  font-size: 0.82rem;
  color: ${dfstyles.colors.subbertext};
  text-align: center;
  line-height: 1.45;
`;

const ButtonCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
`;

const primaryStyles = css`
  justify-content: center;
  text-align: center;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: ${dfstyles.colors.background};
  background: ${dfstyles.colors.dfpink};
  border-color: ${dfstyles.colors.dfpink};

  &:hover {
    color: ${dfstyles.colors.background};
    background: #ffc3cd;
    border-color: #ffc3cd;
    box-shadow: 0 0 18px rgba(255, 180, 193, 0.4);
  }
`;

const BigBtn = styled.button<{ $variant?: 'primary' | 'default' }>`
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  height: 48px;
  min-width: calc(19ch + 50px);
  padding: 4px 24px;
  margin: 0;
  font-family: inherit;
  font-size: 16pt;
  line-height: 1;
  text-align: left;
  border-radius: 4px;
  border: 1px solid ${dfstyles.colors.borderDark};
  background: transparent;
  color: ${dfstyles.colors.text};
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
  transition: filter 0.15s, background 0.15s, color 0.15s, border-color 0.15s;

  &:focus-visible {
    outline: 2px solid ${dfstyles.colors.dfpink};
    outline-offset: 2px;
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }

  ${({ $variant }) =>
    $variant !== 'primary' &&
    css`
      &:hover {
        color: ${dfstyles.colors.background};
        background: ${dfstyles.colors.text};
        border-color: ${dfstyles.colors.border};
        filter: brightness(80%);
      }
    `}

  ${({ $variant }) => $variant === 'primary' && primaryStyles}
`;

const PrimaryRow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const GearBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border-radius: 4px;
  border: 1px solid ${dfstyles.colors.borderDark};
  background: transparent;
  color: ${dfstyles.colors.subtext};
  cursor: pointer;
  box-sizing: border-box;
  transition: filter 0.15s, background 0.15s, color 0.15s, border-color 0.15s;

  &:focus-visible {
    outline: 2px solid ${dfstyles.colors.dfpink};
    outline-offset: 2px;
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }

  &:hover {
    color: ${dfstyles.colors.dfpink};
    border-color: ${dfstyles.colors.dfpink};
    background: rgba(255, 180, 193, 0.1);
  }
`;

const GearIcon = styled.svg`
  width: 22px;
  height: 22px;
`;

const Desc = styled.p`
  margin: -4px 0 8px;
  padding-left: 2px;
  font-size: 0.78rem;
  line-height: 1.4;
  color: ${dfstyles.colors.subbertext};
`;
