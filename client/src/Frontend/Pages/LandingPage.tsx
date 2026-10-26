import { PLAYER_GUIDE } from '@dfares/constants';
import { CONTRACT_ADDRESS } from '@dfares/contracts';
import { address } from '@dfares/serde';
import React from 'react';
import { useHistory } from 'react-router-dom';
import styled, { css } from 'styled-components';
import { Spacer } from '../Components/CoreUI';
import { useEnterUniverse } from '../hooks/useEnterUniverse';
import dfstyles from '../Styles/dfstyles';
import { UniverseEnterTransition } from '../Views/UniverseEnterTransition';

export const enum LandingPageZIndex {
  Background = 0,
  Canvas = 1,
  BasePage = 2,
  Transition = 3,
}

const DFOfficeLinks = {
  twitter: 'http://twitter.com/darkforest_eth',
  email: 'mailto:ivan@0xparc.org',
  blog: 'https://blog.zkga.me/',
  discord: 'https://discord.gg/2u2TN6v8r6',
  github: 'https://github.com/darkforest-eth',
  wiki: 'https://dfwiki.net/wiki/Main_Page',
  plugins: 'https://plugins.zkga.me/',
};

const DFArchonLinks = {
  twitter: 'https://twitter.com/DFArchon',
  email: 'mailto:dfarchon@gmail.com',
  blog: 'https://mirror.xyz/dfarchon.eth',
  discord: 'https://discord.com/invite/XpBPEnsvgX',
  github: 'https://github.com/dfarchon',
  wiki: 'https://dfwiki.net/wiki/Main_Page',
  plugins: 'https://dfares-plugins.netlify.app/',
  guide: PLAYER_GUIDE,
};

const defaultAddress = address(CONTRACT_ADDRESS);

const ButtonWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 14px;
  flex-direction: row;
  margin-bottom: 24px;

  > * {
    box-sizing: border-box;
    width: 240px;
    justify-content: center;
    text-align: center;
  }

  @media only screen and (max-device-width: 1000px) {
    flex-direction: column;
  }
`;

const EnterButton = styled.button`
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid rgba(255, 195, 205, 0.42);
  border-radius: 4px;
  color: #ffc3cd;
  background: rgba(255, 195, 205, 0.08);
  font-family: inherit;
  font-size: 16pt;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s, box-shadow 0.2s, transform 0.2s;

  &:hover:not(:disabled),
  &:focus:not(:disabled) {
    color: white;
    background: rgba(255, 180, 193, 0.14);
    border-color: #ffb4c1;
    box-shadow: 0 0 18px rgba(255, 180, 193, 0.4);
    transform: translateY(-1px);
  }

  &:disabled {
    cursor: default;
    opacity: 0.65;
  }
`;

export default function LandingPage() {
  const history = useHistory();
  const playPath = `/play/${defaultAddress}`;
  const { isEntering, enterUniverse } = useEnterUniverse(playPath);

  return (
    <>
      {/* <PrettyOverlayGradient /> */}

      <Page $entering={isEntering}>
        <MainContentContainer>
          <Header>
            {/* <LinkContainer>
              <Link to={DFArchonLinks.email}>email</Link>
              <Spacer width={4} />
              <Link to={DFArchonLinks.blog}>blog</Link>
              <Spacer width={4} />

              <a className={'link-twitter'} href={DFArchonLinks.twitter}>
                <span className={'icon-twitter'}></span>
              </a>
              <Spacer width={4} />
              <a className={'link-discord'} href={DFArchonLinks.discord}>
                <span className={'icon-discord'}></span>
              </a>
              <Spacer width={4} />
              <a className={'link-github'} href={DFArchonLinks.github}>
                <span className={'icon-github'}></span>
              </a>

              <Spacer width={4} />
              <Link to={DFArchonLinks.plugins}>plugins</Link>
              <Spacer width={4} />
              <Link to={DFArchonLinks.wiki}>wiki</Link>
            </LinkContainer> */}

            <HeroPanel>
              <HeroTitle>Dark Forest Punk</HeroTitle>
              <RoundLine>
                <RoundNetworkBadge>Special edition for Devcon Mumbai</RoundNetworkBadge>
              </RoundLine>

              <IntroText>
                <p>
                  Dark Forest is a fully onchain ZK warfare of exploration, strategy, and conquest.
                </p>
                <p>
                  The original project was developed by the Dark Forest official team from 2019 to
                  Q1 2022.
                </p>
                <p>Dark Forest Punk is the community-maintained branch by DFArchon team.</p>

                <p>
                  Follow the latest updates at{' '}
                  <InlineLink href='https://x.com/dfarchon' target='_blank' rel='noreferrer'>
                    x.com/dfarchon
                  </InlineLink>
                  .
                </p>
              </IntroText>

              <ButtonWrapper>
                <EnterButton
                  type='button'
                  onClick={() => history.push('/booth')}
                  disabled={isEntering}
                >
                  Enter Booth
                </EnterButton>
                <EnterButton onClick={enterUniverse} disabled={isEntering}>
                  Enter Universe
                </EnterButton>
                <GuideLink href={DFArchonLinks.guide} target='_blank' rel='noreferrer'>
                  Player Guide
                </GuideLink>
              </ButtonWrapper>
            </HeroPanel>

            {/*
            <p>
              <White>Dark Forest</White> <Text>zkSNARK space warfare</Text>
              <br />
              <Text>Round 5: </Text>
              <White>The Junk Wars</White>
            </p> */}

            {/* <Spacer height={20} /> */}

            {/* <p>
             <White>DF ARES v0.1 </White> <Text> </Text>
             <br />
              <Text>Round 1: </Text>
              <White>Artifact Combat</White>
            </p> */}

            {/* <Spacer height={16} /> */}

            {/* <ButtonWrapper>
              <Btn size='large' onClick={() => history.push(`/lobby/${defaultAddress}`)}>
                Create Lobby
              </Btn>
              <Btn size='large' onClick={() => history.push(`/play/${defaultAddress}`)}>
                Enter Round 1
              </Btn>
              <Btn size='large' onClick={() => history.push(`/events`)}>
                Events
              </Btn>
            </ButtonWrapper> */}
          </Header>
          {/* <EmSpacer height={3} />
          Ways to get Involved
          <EmSpacer height={1} /> */}
          {/* <Involved>
            <InvolvedItem
              href='https://blog.zkga.me/hosting-a-dark-forest-community-round'
              style={{
                backgroundImage: "url('/public/get_involved/community_round.png')",
              }}
            ></InvolvedItem>
            <InvolvedItem
              href='https://github.com/darkforest-eth/plugins#adding-your-plugin'
              style={{
                backgroundImage: "url('/public/get_involved/write_plugin.png')",
              }}
            ></InvolvedItem>
            <InvolvedItem
              href='https://github.com/darkforest-eth/plugins#reviewer-guidelines'
              style={{
                backgroundImage: "url('/public/get_involved/reveiw_plugin.png')",
              }}
            ></InvolvedItem>
            <InvolvedItem
              href='https://blog.zkga.me/renderer-plugin-contest'
              style={{
                backgroundImage: "url('/public/get_involved/plugin_render.png')",
              }}
            ></InvolvedItem>
            <InvolvedItem
              href='https://blog.zkga.me/introducing-dark-forest-lobbies'
              style={{
                backgroundImage: "url('/public/get_involved/lobby.png')",
              }}
            ></InvolvedItem>
          </Involved> */}
          {/* <EmSpacer height={3} /> */}
          {/* <HallOfFame style={{ color: dfstyles.colors.text }}>
            <HallOfFameTitle>Space Masters</HallOfFameTitle>
            <Spacer height={8} />
            <table>
              <tbody>
                <TRow>
                  <td>
                    <HideSmall>v</HideSmall>0.1
                  </td>
                  <td>
                    02/22/<HideSmall>20</HideSmall>20
                  </td>
                  <td>
                    <a href='https://twitter.com/zoink'>Dylan Field</a>
                  </td>
                </TRow>
                <TRow>
                  <td>
                    <HideSmall>v</HideSmall>0.2
                  </td>
                  <td>
                    06/24/<HideSmall>20</HideSmall>20
                  </td>
                  <td>Nate Foss</td>
                </TRow>
                <TRow>
                  <td>
                    <Link to='https://blog.zkga.me/v3-rules'>
                      <HideSmall>v</HideSmall>0.3
                    </Link>
                  </td>
                  <td>
                    08/07/<HideSmall>20</HideSmall>20
                  </td>
                  <td>
                    <Link to='https://twitter.com/hideandcleanse'>@hideandcleanse</Link>
                  </td>
                </TRow>
                <TRow>
                  <td>
                    <Link to='https://blog.zkga.me/v4-recap'>
                      <HideSmall>v</HideSmall>0.4
                    </Link>
                  </td>
                  <td>
                    10/02/<HideSmall>20</HideSmall>20
                  </td>
                  <td>
                    <Link to='https://twitter.com/jacobrosenthal'>Jacob Rosenthal</Link>
                  </td>
                </TRow>
                <TRow>
                  <td>
                    <Link to='https://blog.zkga.me/v5-winners'>
                      <HideSmall>v</HideSmall>0.5
                    </Link>
                  </td>
                  <td>
                    12/25/<HideSmall>20</HideSmall>20
                  </td>
                  <td>0xb05d9542...</td>
                </TRow>
                <TRow>
                  <td>
                    <Link to='https://blog.zkga.me/v6-r1-wrapup'>
                      <HideSmall>v</HideSmall>0.6 round 1
                    </Link>
                  </td>
                  <td>
                    05/22/<HideSmall>20</HideSmall>21
                  </td>
                  <td>
                    <Link to='https://twitter.com/adietrichs'>Ansgar Dietrichs</Link>
                  </td>
                </TRow>
                <TRow>
                  <td>
                    <Link to='https://blog.zkga.me/v6-r2-wrapup'>
                      <HideSmall>v</HideSmall>0.6 round 2
                    </Link>
                  </td>
                  <td>
                    07/07/<HideSmall>20</HideSmall>21
                  </td>
                  <td>
                    <Link to='https://twitter.com/orden_gg'>@orden_gg</Link>
                  </td>
                </TRow>
                <TRow>
                  <td>
                    <Link to='https://blog.zkga.me/v6-r3-wrapup'>
                      <HideSmall>v</HideSmall>0.6 round 3
                    </Link>
                  </td>
                  <td>
                    08/22/<HideSmall>20</HideSmall>21
                  </td>
                  <td>
                    <Link to='https://twitter.com/dropswap_gg'>@dropswap_gg</Link>
                  </td>
                </TRow>
                <TRow>
                  <td>
                    <Link to='https://blog.zkga.me/v6-r4-wrapup'>
                      <HideSmall>v</HideSmall>0.6 round 4
                    </Link>
                  </td>
                  <td>
                    10/01/<HideSmall>20</HideSmall>21
                  </td>
                  <td>
                    <Link to='https://twitter.com/orden_gg'>@orden_gg</Link>
                  </td>
                </TRow>
                <TRow>
                  <td>
                    <Link to='https://blog.zkga.me/v6-r5-wrapup'>
                      <HideSmall>v</HideSmall>0.6 round 5
                    </Link>
                  </td>
                  <td>
                    02/18/<HideSmall>20</HideSmall>22
                  </td>
                  <td>
                    <Link to='https://twitter.com/d_fdao'>@d_fdao</Link>
                    {' + '}
                    <Link to='https://twitter.com/orden_gg'>@orden_gg</Link>
                  </td>
                </TRow>
              </tbody>
            </table>
          </HallOfFame> */}
          <Spacer height={32} />
          {/* <EmailWrapper>
            <EmailCTA mode={EmailCTAMode.SUBSCRIBE} />
          </EmailWrapper> */}
        </MainContentContainer>

        {/* <Spacer height={128} />

        <LeadboardDisplay />

        <Spacer height={256} /> */}
      </Page>
      <UniverseEnterTransition active={isEntering} />
    </>
  );
}

const HeroPanel = styled.div`
  --chain-primary: #ff3b3b;
  --chain-secondary: #ffb4c1;
  --chain-quiet: #ffc3cd;

  position: relative;
  width: min(960px, calc(100vw - 32px));
  padding: 42px 38px 32px;
  overflow: visible;
`;

const HeroTitle = styled.h1`
  display: block;
  margin: 0;
  color: ${dfstyles.colors.dfpink};
  font-family: inherit;
  font-size: clamp(38px, 5vw, 58px);
  font-weight: 700;
  line-height: 1.08;
  white-space: nowrap;
  text-shadow: 0 0 8px rgba(255, 180, 193, 0.5), 0 0 20px rgba(255, 59, 59, 0.25);
`;

const RoundLine = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 18px;
  margin: 8px 0 26px;
  color: ${dfstyles.colors.dfpink};
  font-size: clamp(24px, 3vw, 34px);
  font-weight: 600;
  line-height: 1.2;

  @media only screen and (max-device-width: 1000px) {
    flex-direction: column;
    gap: 10px;
  }
`;

const RoundNetworkBadge = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0;
  color: var(--chain-secondary);
  background: transparent;
  box-shadow: none;
  font-size: 0.55em;
  font-weight: 400;
  letter-spacing: 0.04em;
`;

const IntroText = styled.div`
  max-width: 820px;
  margin: 0 auto 28px;
  color: ${dfstyles.colors.textLight};
  font-size: 18px;
  line-height: 1.55;
  text-align: center;

  p {
    margin: 0 0 14px;
  }

  p:last-child {
    margin-bottom: 0;
  }
`;

const InlineLink = styled.a`
  color: var(--chain-secondary);
  text-decoration: underline;
  text-underline-offset: 3px;

  &:hover {
    color: white;
  }
`;

const GuideLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid rgba(255, 195, 205, 0.42);
  border-radius: 4px;
  color: var(--chain-quiet);
  background: rgba(255, 195, 205, 0.08);
  font-family: inherit;
  font-size: ${dfstyles.fontSizeS};
  letter-spacing: 0.02em;
  transition: border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s;

  &:hover {
    color: white;
    border-color: var(--chain-secondary);
    box-shadow: 0 0 18px rgba(255, 180, 193, 0.28);
    transform: translateY(-1px);
  }
`;

const PrettyOverlayGradient = styled.div`
  width: 100vw;
  height: 100vh;
  background: linear-gradient(to left top, rgba(74, 74, 74, 0.628), rgba(60, 1, 255, 0.2)) fixed;
  background-position: 50%, 50%;
  display: inline-block;
  position: fixed;
  top: 0;
  left: 0;
  z-index: -1;
`;

const Header = styled.div`
  width: 100%;
  text-align: center;
`;

const EmailWrapper = styled.div`
  display: flex;
  flex-direction: row;
`;

const TRow = styled.tr`
  & td:first-child {
    color: ${dfstyles.colors.subtext};
  }
  & td:nth-child(2) {
    padding-left: 12pt;
  }
  & td:nth-child(3) {
    text-align: right;
    padding-left: 16pt;
  }
`;

const MainContentContainer = styled.div`
  position: relative;
  max-width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 1;
`;

const Page = styled.div<{ $entering?: boolean }>`
  position: absolute;
  width: 100vw;
  max-width: 100vw;
  height: 100%;
  color: white;
  background: radial-gradient(circle at 50% 34%, rgba(255, 59, 59, 0.16), transparent 28%),
    radial-gradient(circle at 78% 18%, rgba(255, 180, 193, 0.1), transparent 24%),
    radial-gradient(circle at 20% 82%, rgba(0, 220, 130, 0.08), transparent 22%),
    linear-gradient(180deg, #09070d 0%, #030306 58%, #08050a 100%);
  font-size: ${dfstyles.fontSize};
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: ${LandingPageZIndex.BasePage};
  overflow: hidden;

  transition: opacity 0.3s ease-out, filter 0.3s ease-out, transform 0.8s ease-in;
  ${({ $entering }) =>
    $entering &&
    css`
      opacity: 0;
      filter: blur(12px);
      transform: scale(0.92);
    `}

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: radial-gradient(circle at center, black, transparent 72%);
    opacity: 0.45;
    z-index: 0;
  }
`;

const HallOfFameTitle = styled.div`
  color: ${dfstyles.colors.subtext};
  display: inline-block;
  border-bottom: 1px solid ${dfstyles.colors.subtext};
  line-height: 1em;
`;

export const LinkContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  /* margin-top: 130pt; */
  font-family: inherit;

  a {
    margin: 0 6pt;
    transition: color 0.2s;
    display: flex;
    justify-content: center;
    align-items: center;
    color:  ${'#ffc3cd'};
    font-family: inherit;

    &:hover {
      cursor: pointer;
      &.link-twitter {
        color: ${dfstyles.colors.icons.twitter};
      }
      &.link-github {
        color: ${dfstyles.colors.icons.github};
      }
      &.link-discord {
        color: ${dfstyles.colors.icons.discord};
      }
      &.link-blog {
        color: ${dfstyles.colors.icons.blog};
      }
      &.link-email {
        color: ${dfstyles.colors.icons.email};
      }
      &.link{
        /* color: ${dfstyles.colors.dfpink}; */
        color:${'white'}
        /* font-weight: bolder; */

      }
      }
    }
  }
`;

const HideOnMobile = styled.div`
  @media only screen and (max-device-width: 1000px) {
    display: none;
  }
`;

const OnlyMobile = styled.div`
  @media only screen and (min-device-width: 1000px) {
    display: none;
  }
`;

const Involved = styled.div`
  width: 100%;
  padding-left: 16px;
  padding-right: 16px;
  display: grid;
  grid-template-columns: auto auto;
  gap: 10px;
  grid-auto-rows: minmax(100px, auto);

  @media only screen and (max-device-width: 1000px) {
    grid-template-columns: auto;
  }
`;

const InvolvedItem = styled.a`
  height: 150px;
  display: inline-block;
  margin: 4px;
  padding: 4px 8px;

  background-color: ${dfstyles.colors.backgroundlighter};
  background-size: cover;
  background-position: 50% 50%;
  background-repeat: no-repeat;

  cursor: pointer;
  transition: transform 200ms;
  &:hover {
    transform: scale(1.03);
  }
  &:hover:active {
    transform: scale(1.05);
  }
`;

const HallOfFame = styled.div`
  @media only screen and (max-device-width: 1000px) {
    font-size: 70%;
  }
`;
