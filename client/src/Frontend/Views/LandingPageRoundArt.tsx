import React from 'react';
import styled from 'styled-components';

type LandingPageRoundArtProps = {
  onEnter: () => void;
};

export function LandingPageRoundArt({ onEnter }: LandingPageRoundArtProps) {
  return (
    <Container>
      <ImgContainer>
        <LandingPageRoundArtImg
          src={'/public/dfpunk-logo.png'}
          alt='Dark Forest Punk'
          onClick={onEnter}
        />
        {/* <Smaller>
          <Text>Art by</Text> <TwitterLink twitter='JannehMoe' />{' '}
        </Smaller> */}
      </ImgContainer>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;

const ImgContainer = styled.div`
  position: relative;
  display: inline-block;
  width: 220px;
  max-width: 70vw;
  aspect-ratio: 1;
`;

const LandingPageRoundArtImg = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: pointer;
`;
