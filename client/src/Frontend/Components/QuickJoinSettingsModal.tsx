import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { getAccounts } from '../../Backend/Network/AccountManager';
import {
  clearQuickJoinDefaultAccount,
  getQuickJoinDefaultAccount,
  setQuickJoinDefaultAccount,
} from '../Utils/quickJoin';
import dfstyles from '../Styles/dfstyles';
import { Btn } from './Btn';
import { Title } from './CoreUI';
import { Text } from './Text';

function shortAddress(address: string): string {
  if (address.length <= 18) return address;
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(6px);
`;

const Card = styled.div`
  width: min(520px, calc(100vw - 48px));
  max-height: min(80vh, 560px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px 22px 28px;
  border-radius: ${dfstyles.borderRadius};
  border: 1px solid ${dfstyles.colors.borderDarkest};
  background: rgba(21, 21, 21, 0.96);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
`;

const Intro = styled.p`
  margin: 0 0 14px;
  color: ${dfstyles.colors.subtext};
  font-size: ${dfstyles.fontSizeS};
  line-height: 1.45;
  flex-shrink: 0;
`;

const accountBoxBorder = `1px solid ${dfstyles.colors.borderDarker}`;
const accountBoxRadius = dfstyles.borderRadius;
const accountBoxBg = 'rgba(255, 255, 255, 0.025)';
const accountBoxThumbBg = 'rgba(255, 255, 255, 0.045)';

const AccountListWrap = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
  align-items: stretch;
`;

const AccountListScroll = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const ScrollRail = styled.div`
  flex-shrink: 0;
  align-self: stretch;
  width: 16px;
  min-height: 0;
  box-sizing: border-box;
  border: ${accountBoxBorder};
  border-radius: ${accountBoxRadius};
  background: ${accountBoxBg};
  position: relative;
  overflow: hidden;
`;

const ScrollThumb = styled.div<{ $top: number; $height: number }>`
  position: absolute;
  left: 0;
  right: 0;
  top: ${({ $top }) => $top}px;
  height: ${({ $height }) => $height}px;
  box-sizing: border-box;
  border: ${accountBoxBorder};
  border-radius: ${accountBoxRadius};
  background: ${accountBoxThumbBg};
`;

const AccountRow = styled.label<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid
    ${({ $selected }) => ($selected ? dfstyles.colors.dfpink : dfstyles.colors.borderDarker)};
  border-radius: ${dfstyles.borderRadius};
  background: ${({ $selected }) =>
    $selected ? 'rgba(255, 180, 193, 0.1)' : 'rgba(255, 255, 255, 0.025)'};
  cursor: pointer;
  font-size: ${dfstyles.fontSizeS};
  color: ${dfstyles.colors.text};

  &:hover {
    border-color: ${({ $selected }) =>
      $selected ? dfstyles.colors.dfpink : dfstyles.colors.border};
    background: ${({ $selected }) =>
      $selected ? 'rgba(255, 180, 193, 0.14)' : 'rgba(255, 255, 255, 0.045)'};
  }
`;

const A11yRadio = styled.input.attrs({ type: 'radio' })`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const RadioIndicator = styled.span<{ $selected: boolean }>`
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid
    ${({ $selected }) => ($selected ? dfstyles.colors.dfpink : dfstyles.colors.subtext)};
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ $selected }) => ($selected ? 'rgba(255, 180, 193, 0.15)' : 'transparent')};

  &::after {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ $selected }) => ($selected ? dfstyles.colors.dfpink : 'transparent')};
  }
`;

const SingleAccountCard = styled.div`
  padding: 10px 12px;
  border: 1px solid ${dfstyles.colors.dfpink};
  border-radius: ${dfstyles.borderRadius};
  background: rgba(255, 180, 193, 0.1);
`;

const RowBody = styled.span`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const RowTitle = styled.span`
  color: ${dfstyles.colors.textLight};
`;

const AddressMono = styled.span`
  display: block;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${dfstyles.colors.subtext};
  font-size: ${dfstyles.fontSizeXS};
`;

export function QuickJoinSettingsModal({
  open,
  onClose,
  onPreferenceSaved,
}: {
  open: boolean;
  onClose: () => void;
  onPreferenceSaved?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [accounts, setAccounts] = useState<ReturnType<typeof getAccounts>>([]);
  const [selection, setSelection] = useState<'auto' | string>('auto');
  const [listScrollable, setListScrollable] = useState(false);
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
  });

  const updateScrollMetrics = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const { scrollTop, scrollHeight, clientHeight } = list;
    setListScrollable(scrollHeight > clientHeight + 1);
    setScrollMetrics({ scrollTop, scrollHeight, clientHeight });
  }, []);

  const reload = useCallback(() => {
    const list = getAccounts();
    setAccounts(list);
    const saved = getQuickJoinDefaultAccount();
    if (saved && list.some((a) => a.address === saved)) {
      setSelection(saved);
    } else {
      setSelection('auto');
    }
  }, []);

  useEffect(() => {
    if (open) {
      reload();
    }
  }, [open, reload]);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(updateScrollMetrics);
    const list = listRef.current;
    if (!list) {
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new ResizeObserver(updateScrollMetrics);
    observer.observe(list);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [open, accounts, updateScrollMetrics]);

  useEffect(() => {
    if (!open) return;

    const handleOutsideMouseDown = (event: MouseEvent) => {
      const card = cardRef.current;
      if (!card) return;
      const path = event.composedPath();
      if (!path.includes(card)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOutsideMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideMouseDown);
    };
  }, [onClose, open]);

  const chooseSelection = useCallback(
    (value: 'auto' | string) => {
      setSelection(value);
      if (value === 'auto') {
        clearQuickJoinDefaultAccount();
      } else {
        setQuickJoinDefaultAccount(value);
      }
      onPreferenceSaved?.();
    },
    [onPreferenceSaved]
  );

  if (!open) return null;

  const newest = accounts.length > 0 ? accounts[accounts.length - 1] : undefined;
  const onlyAccount = accounts.length === 1 ? accounts[0] : undefined;
  const { scrollTop, scrollHeight, clientHeight } = scrollMetrics;
  const scrollRange = scrollHeight - clientHeight;
  const thumbHeight =
    scrollRange > 0 ? Math.max(20, (clientHeight / scrollHeight) * clientHeight) : 0;
  const thumbTravel = Math.max(0, clientHeight - thumbHeight);
  const thumbTop = scrollRange > 0 ? (scrollTop / scrollRange) * thumbTravel : 0;

  return (
    <Backdrop>
      <Card ref={cardRef}>
        <Header>
          <Title>Quick join account</Title>
          <Btn onClick={onClose}>close</Btn>
        </Header>
        <Intro>
          {onlyAccount ? (
            <>You have one local account. Quick join always uses it.</>
          ) : (
            <>
              Pick the local account Quick join should use. Auto follows your newest local account.
            </>
          )}
        </Intro>

        {accounts.length === 0 ? (
          <Text>No local accounts yet. Quick join will create one the first time you enter.</Text>
        ) : onlyAccount ? (
          <SingleAccountCard>
            <RowTitle>Your account</RowTitle>
            <AddressMono>{onlyAccount.address}</AddressMono>
          </SingleAccountCard>
        ) : (
          <AccountListWrap>
            <AccountListScroll ref={listRef} onScroll={updateScrollMetrics}>
              <AccountRow $selected={selection === 'auto'}>
                <A11yRadio
                  name='quick-join-account'
                  checked={selection === 'auto'}
                  onChange={() => chooseSelection('auto')}
                />
                <RadioIndicator $selected={selection === 'auto'} />
                <RowBody>
                  <RowTitle>Auto, newest account</RowTitle>
                  {newest ? (
                    <AddressMono>Currently {shortAddress(newest.address)}</AddressMono>
                  ) : null}
                </RowBody>
              </AccountRow>
              {accounts.map((a) => (
                <AccountRow key={a.address} $selected={selection === a.address}>
                  <A11yRadio
                    name='quick-join-account'
                    checked={selection === a.address}
                    onChange={() => chooseSelection(a.address)}
                  />
                  <RadioIndicator $selected={selection === a.address} />
                  <RowBody>
                    <RowTitle>{shortAddress(a.address)}</RowTitle>
                    <AddressMono>{a.address}</AddressMono>
                  </RowBody>
                </AccountRow>
              ))}
            </AccountListScroll>
            {listScrollable ? (
              <ScrollRail
                aria-hidden
                style={clientHeight > 0 ? { height: clientHeight } : undefined}
              >
                <ScrollThumb $top={thumbTop} $height={thumbHeight} />
              </ScrollRail>
            ) : null}
          </AccountListWrap>
        )}
      </Card>
    </Backdrop>
  );
}
