import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import dfstyles from '../Styles/dfstyles';

const MESSAGE_DURATION_MS = 8000;

export function CopyToClipboardButton({
  text,
  label,
  successMessage = '<= copied successfully',
  failureMessage = '<= copy failed',
}: {
  text: string;
  label: string;
  successMessage?: string;
  failureMessage?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'success' | 'failure'>('idle');

  useEffect(() => {
    if (status === 'idle') return;

    const timeoutId = setTimeout(() => setStatus('idle'), MESSAGE_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [status]);

  const onClick = useCallback(
    async (e: React.SyntheticEvent) => {
      e.stopPropagation();
      try {
        await copyTextToClipboard(text);
        setStatus('success');
      } catch (err) {
        console.error(err);
        setStatus('failure');
      }
    },
    [text]
  );

  return (
    <Wrap>
      <Btn type='button' onClick={onClick}>
        {label}
      </Btn>
      {status === 'success' ? <Hint $tone='success'>{successMessage}</Hint> : null}
      {status === 'failure' ? <Hint $tone='failure'>{failureMessage}</Hint> : null}
    </Wrap>
  );
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, falling back to execCommand', err);
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.opacity = '0';

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('document.execCommand("copy") returned false');
    }
  } finally {
    document.body.removeChild(textArea);
  }
}

const Wrap = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  vertical-align: baseline;
`;

const Btn = styled.button`
  display: inline-block;
  margin: 0;
  padding: 4px 12px;
  border: 1px solid ${dfstyles.colors.dfred};
  border-radius: 4px;
  background: ${dfstyles.colors.dfpink};
  color: ${dfstyles.colors.background};
  cursor: pointer;
  font: inherit;
  line-height: 1.3;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);

  &:hover {
    filter: brightness(1.06);
  }

  &:active {
    transform: translateY(1px);
    box-shadow: none;
  }

  &:focus,
  &:focus-visible {
    outline: none;
  }
`;

const Hint = styled.span<{ $tone: 'success' | 'failure' }>`
  color: ${({ $tone }) => ($tone === 'success' ? dfstyles.colors.dfpink : dfstyles.colors.dfred)};
`;
