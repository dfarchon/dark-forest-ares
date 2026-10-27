import React from 'react';
import styled from 'styled-components';

const LIGHT = '#FFB7C5';
const DARK = '#E68398';
const WHITE = '#FFFFFF';

const CELL = 20;
const X0 = 125;

type Block = { x: number; y: number; w: number; h: number; fill: string };

function cell(col: number, row: number, fill: string, cols = 1, rows = 1): Block {
  return {
    x: X0 + col * CELL,
    y: row * CELL,
    w: cols * CELL,
    h: rows * CELL,
    fill,
  };
}

// Traced from the original mark. Columns are 20px; column 0 is the left ear.
// Windows are white blocks, side pods are the darker pink.
const SHIP: Block[] = [
  cell(3, 0, LIGHT, 2),
  cell(2, 1, LIGHT, 4),
  cell(1, 2, LIGHT, 6),
  cell(1, 3, LIGHT, 6),
  cell(0, 3, DARK),
  cell(7, 3, DARK),
  cell(1, 4, LIGHT, 6),
  cell(0, 4, DARK),
  cell(7, 4, DARK),
  cell(1, 5, LIGHT),
  cell(2, 5, WHITE),
  cell(3, 5, LIGHT, 2),
  cell(5, 5, WHITE),
  cell(6, 5, LIGHT),
  cell(1, 6, LIGHT),
  cell(2, 6, WHITE),
  cell(3, 6, LIGHT, 2),
  cell(5, 6, WHITE),
  cell(6, 6, LIGHT),
  cell(1, 7, LIGHT, 6),
  cell(0, 8, LIGHT),
  cell(2, 8, LIGHT),
  cell(5, 8, LIGHT),
  cell(7, 8, LIGHT),
  cell(0, 9, LIGHT),
  cell(2, 9, LIGHT),
  cell(5, 9, LIGHT),
  cell(7, 9, LIGHT),
  cell(0, 10, LIGHT),
  cell(2, 10, LIGHT),
  cell(5, 10, LIGHT),
  cell(7, 10, LIGHT),
  cell(0, 11, LIGHT),
  cell(2, 11, LIGHT),
  cell(5, 11, LIGHT),
  cell(7, 11, LIGHT),
  cell(0, 12, LIGHT),
  cell(2, 12, LIGHT),
  cell(5, 12, LIGHT),
  cell(7, 12, LIGHT),
  cell(-1, 13, LIGHT),
  cell(2, 13, LIGHT),
  cell(5, 13, LIGHT),
  cell(8, 13, LIGHT),
];

const PLANET = { cx: 206, cy: 288, r: 156 };
const RING = { rx: 220, ry: 62, rotate: -18, stroke: 16, dy: 46 };

const Frame = styled.div`
  position: relative;
  width: min(236px, 62vw);
  margin: 0 auto 4px;
`;

const Mark = styled.svg`
  position: relative;
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
`;

export function PunkMark() {
  const { cx, cy, r } = PLANET;
  const ringTransform = `translate(${cx} ${cy + RING.dy}) rotate(${RING.rotate})`;

  return (
    <Frame>
      <Mark viewBox='-40 -20 500 540' role='img' aria-label='Dark Forest Punk'>
        <defs>
          <clipPath id='punk-mark-ring-front' clipPathUnits='userSpaceOnUse'>
            <rect x={-400} y={0} width={800} height={400} />
          </clipPath>
          <radialGradient id='punk-planet-glow' cx='50%' cy='50%' r='50%'>
            <stop offset='0%' stopColor='#ffb4c1' stopOpacity='0.2' />
            <stop offset='62%' stopColor='#ffb4c1' stopOpacity='0.42' />
            <stop offset='100%' stopColor='#ff3b3b' stopOpacity='0' />
          </radialGradient>
          <filter
            id='punk-planet-rim'
            x='-70%'
            y='-70%'
            width='240%'
            height='240%'
            colorInterpolationFilters='sRGB'
          >
            <feDropShadow dx='0' dy='0' stdDeviation='28' floodColor='#ffb4c1' floodOpacity='0.8' />
          </filter>
        </defs>

        <circle cx={cx} cy={cy} r={r + 52} fill='url(#punk-planet-glow)' />

        <g transform={ringTransform}>
          <ellipse
            cx={0}
            cy={0}
            rx={RING.rx}
            ry={RING.ry}
            fill='none'
            stroke={LIGHT}
            strokeWidth={RING.stroke}
          />
        </g>

        <circle cx={cx} cy={cy} r={r} fill={WHITE} filter='url(#punk-planet-rim)' />

        <g transform={ringTransform} clipPath='url(#punk-mark-ring-front)'>
          <ellipse
            cx={0}
            cy={0}
            rx={RING.rx}
            ry={RING.ry}
            fill='none'
            stroke={LIGHT}
            strokeWidth={RING.stroke}
          />
        </g>

        <g shapeRendering='crispEdges'>
          {SHIP.map((block, index) => (
            <rect
              key={index}
              x={block.x}
              y={block.y}
              width={block.w}
              height={block.h}
              fill={block.fill}
            />
          ))}
        </g>
      </Mark>
    </Frame>
  );
}
