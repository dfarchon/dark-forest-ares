import { TOKEN_NAME } from '@dfares/constants';
import { CONTRACT_ADDRESS, NETWORK_ID } from '@dfares/contracts';
import { weiToEth } from '@dfares/network';
import { address } from '@dfares/serde';
import { BigNumber, providers } from 'ethers';
import React, { useCallback, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import {
  ExhibitionAccount,
  exhibitionEntryMessage,
  loadExhibitionAccounts,
} from '../Utils/exhibition';
import dfstyles from '../Styles/dfstyles';

type AccountStatus = {
  balanceWei: bigint;
  balanceLabel: string;
};

function boothRpcUrl(): string {
  const defaultUrl = process.env.DEFAULT_RPC || 'http://localhost:8545';
  if (process.env.NODE_ENV === 'production') {
    return localStorage.getItem('XDAI_RPC_ENDPOINT_v5') || defaultUrl;
  }
  return defaultUrl;
}

const Page = styled.div`
  min-height: 100vh;
  box-sizing: border-box;
  padding: 48px 24px 64px;
  color: ${dfstyles.colors.text};
  background: ${dfstyles.colors.background};
  font-family: 'Inconsolata', monospace;
`;

const Frame = styled.div`
  width: min(920px, 100%);
  margin: 0 auto;
`;

const Title = styled.h1`
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 400;
  color: ${dfstyles.colors.dfpink};
`;

const Subtitle = styled.p`
  margin: 0 0 24px;
  color: ${dfstyles.colors.subtext};
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
`;

const Button = styled.button`
  border: 1px solid ${dfstyles.colors.dfpink};
  background: transparent;
  color: ${dfstyles.colors.dfpink};
  font: inherit;
  padding: 8px 16px;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

const CardButton = styled.button<{ $enabled: boolean }>`
  display: block;
  width: 100%;
  margin: 0 0 12px;
  padding: 16px 18px;
  text-align: left;
  font: inherit;
  color: ${dfstyles.colors.text};
  background: ${dfstyles.colors.backgrounddark};
  border: 1px solid
    ${(props) => (props.$enabled ? dfstyles.colors.dfgreen : dfstyles.colors.borderDark)};
  cursor: ${(props) => (props.$enabled ? 'pointer' : 'default')};

  &:disabled {
    opacity: 0.85;
  }
`;

const CardTitle = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: ${dfstyles.colors.text};
`;

const Meta = styled.div`
  color: ${dfstyles.colors.subtext};
  line-height: 1.5;
  word-break: break-all;
`;

const Message = styled.div<{ $ready: boolean }>`
  margin-top: 8px;
  color: ${(props) => (props.$ready ? dfstyles.colors.dfgreen : dfstyles.colors.dfred)};
`;

const ErrorText = styled.p`
  color: ${dfstyles.colors.dfred};
`;

function toBigInt(value: BigNumber): bigint {
  return BigInt(value.toString());
}

export function ExhibitionBoothPage() {
  const history = useHistory();
  const [accounts, setAccounts] = useState<ExhibitionAccount[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AccountStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadExhibitionAccounts();
      setAccounts(loaded);
      try {
        const provider = new providers.StaticJsonRpcProvider(boothRpcUrl(), NETWORK_ID);
        const readable = loaded.filter((account) => account.keyMatches);
        const balances = await Promise.all(
          readable.map((account) => provider.getBalance(address(account.publicKey)))
        );
        const next: Record<string, AccountStatus> = {};
        readable.forEach((account, index) => {
          const balance = balances[index];
          next[account.id] = {
            balanceWei: toBigInt(balance),
            balanceLabel: `${weiToEth(balance).toFixed(6)} ${TOKEN_NAME}`,
          };
        });
        setStatuses(next);
      } catch (err) {
        console.error(err);
        setStatuses({});
        setError(
          err instanceof Error
            ? `Could not read balances. ${err.message}`
            : 'Could not read balances.'
        );
      }
    } catch (err) {
      setAccounts([]);
      setStatuses({});
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Page>
      <Frame>
        <Title>Exhibition booths</Title>
        <Subtitle>Pick an account. The client mines around that account's spawn center.</Subtitle>
        <Toolbar>
          <Button type='button' onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh balances'}
          </Button>
        </Toolbar>
        {error && <ErrorText>{error}</ErrorText>}
        {accounts.map((account) => {
          const status = statuses[account.id] ?? null;
          const entry = !status && error && account.keyMatches && account.spawnValid
            ? {
                canEnter: false,
                message: 'Could not read this account balance.',
              }
            : exhibitionEntryMessage(account, status);
          const spawnLabel = account.spawnValid && account.spawn
            ? `(${account.spawn.x}, ${account.spawn.y})`
            : 'missing';
          return (
            <CardButton
              key={account.id}
              type='button'
              $enabled={entry.canEnter && !loading}
              disabled={!entry.canEnter || loading}
              onClick={() => {
                history.push(
                  `/play/${address(CONTRACT_ADDRESS)}?booth=${encodeURIComponent(account.id)}`
                );
              }}
            >
              <CardTitle>
                <span>{account.label}</span>
                <span>{status ? status.balanceLabel : 'balance unavailable'}</span>
              </CardTitle>
              <Meta>
                {account.publicKey}
                <br />
                Spawn {spawnLabel}
              </Meta>
              <Message $ready={entry.canEnter}>{entry.message}</Message>
            </CardButton>
          );
        })}
      </Frame>
    </Page>
  );
}
