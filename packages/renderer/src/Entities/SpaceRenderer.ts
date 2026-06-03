import {
  Chunk,
  PerlinConfig,
  Rectangle,
  RendererType,
  SpaceRendererType,
  Vec3,
} from '@dfares/types';
import { EngineUtils } from '../EngineUtils';
import { SPACE_PROGRAM_DEFINITION } from '../Programs/SpaceProgram';
import { AttribManager } from '../WebGL/AttribManager';
import { GameGLManager } from '../WebGL/GameGLManager';
import { GenericRenderer } from '../WebGL/GenericRenderer';
import {
  getCachedGradient,
  getGridPoint,
  getPerlinChunks,
  getQuadrant,
  PerlinOctave,
  right,
  up,
  valueOf,
} from './PerlinUtils';

export type SpaceColorUniforms = {
  innerNebulaColor: Vec3;
  nebulaColor: Vec3;
  spaceColor: Vec3;
  deepSpaceColor: Vec3;
  deadSpaceColor: Vec3;
};

function hexToRgb(hex: string): Vec3 {
  const bigint = parseInt(hex.replace('#', ''), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return [r / 255.0, g / 255.0, b / 255.0];
}

const fallbackColor = '#000000';

export class SpaceRenderer
  extends GenericRenderer<typeof SPACE_PROGRAM_DEFINITION>
  implements SpaceRendererType
{
  manager: GameGLManager;
  config: PerlinConfig;

  posBuffer: number[];
  coordsBuffer: number[];

  thresholds: Vec3;
  colors: SpaceColorUniforms;

  rendererType = RendererType.Space;

  constructor(manager: GameGLManager) {
    super(manager, SPACE_PROGRAM_DEFINITION);
    this.config = manager.renderer.context.getPerlinConfig(false);
    const colors = this.manager.renderer.config.spaceColors;

    this.posBuffer = EngineUtils.makeEmptyQuadVec2();
    this.coordsBuffer = EngineUtils.makeEmptyQuadVec2();

    this.thresholds = manager.renderer.context.getPerlinThresholds();

    // construct color cache, we mutate this later
    this.colors = {
      innerNebulaColor: hexToRgb(colors.innerNebulaColor || fallbackColor),
      nebulaColor: hexToRgb(colors.nebulaColor || fallbackColor),
      spaceColor: hexToRgb(colors.spaceColor || fallbackColor),
      deepSpaceColor: hexToRgb(colors.deepSpaceColor || fallbackColor),
      deadSpaceColor: hexToRgb(colors.deadSpaceColor || fallbackColor),
    };
  }

  private bufferGradients(
    rect: Rectangle,
    octave: PerlinOctave,
    topGrad: AttribManager,
    botGrad: AttribManager
  ) {
    const { scale } = this.config;
    const { bottomLeft } = rect;
    const octaveScale = scale * 2 ** octave;

    const gridPoint = getGridPoint(bottomLeft, octaveScale);
    const quadrant = getQuadrant(gridPoint);

    const botLeft = gridPoint;
    const botRight = right(botLeft, octaveScale);
    const topLeft = up(botLeft, octaveScale);
    const topRight = right(up(botLeft, octaveScale), octaveScale);

    const botLeftGrad = getCachedGradient(quadrant, botLeft, this.config, octave);
    const botRightGrad = getCachedGradient(quadrant, botRight, this.config, octave);
    const topLeftGrad = getCachedGradient(quadrant, topLeft, this.config, octave);
    const topRightGrad = getCachedGradient(quadrant, topRight, this.config, octave);

    // technically we should buffer this
    const topGradVals = [...valueOf(topLeftGrad), ...valueOf(topRightGrad)];
    const botGradVals = [...valueOf(botLeftGrad), ...valueOf(botRightGrad)];

    for (let i = 0; i < 6; i++) {
      topGrad.setVertex(topGradVals, this.verts + i);
      botGrad.setVertex(botGradVals, this.verts + i);
    }
  }

  private queueRect(rect: Rectangle): void {
    const { bottomLeft } = rect;

    // get info
    const { sideLength } = rect;
    const { x: xW, y: yW } = bottomLeft;

    const viewport = this.manager.renderer.getViewport();

    // Convert all 4 world corners to screen space individually.
    // In isometric mode this forms a diamond; in 2D mode it's an axis-aligned rect.
    // This preserves correct vertex-to-worldCoord correspondence for GPU interpolation.
    const cTL = viewport.worldToCanvasCoords({ x: xW, y: yW + sideLength });
    const cBL = viewport.worldToCanvasCoords({ x: xW, y: yW });
    const cTR = viewport.worldToCanvasCoords({ x: xW + sideLength, y: yW + sideLength });
    const cBR = viewport.worldToCanvasCoords({ x: xW + sideLength, y: yW });

    // queue it
    const {
      position: posA,
      p0topGrad,
      p0botGrad,
      p1topGrad,
      p1botGrad,
      p2topGrad,
      p2botGrad,
      worldCoords: worldCoordsA,
    } = this.attribManagers;

    // Build position quad as 2 triangles matching the vertex order of makeQuadVec2Buffered:
    // Triangle 1: v0(TL), v1(BL), v2(TR)
    // Triangle 2: v3(TR), v4(BL), v5(BR)
    this.posBuffer[0] = Math.round(cTL.x); this.posBuffer[1] = Math.round(cTL.y);
    this.posBuffer[2] = Math.round(cBL.x); this.posBuffer[3] = Math.round(cBL.y);
    this.posBuffer[4] = Math.round(cTR.x); this.posBuffer[5] = Math.round(cTR.y);
    this.posBuffer[6] = Math.round(cTR.x); this.posBuffer[7] = Math.round(cTR.y);
    this.posBuffer[8] = Math.round(cBL.x); this.posBuffer[9] = Math.round(cBL.y);
    this.posBuffer[10] = Math.round(cBR.x); this.posBuffer[11] = Math.round(cBR.y);
    posA.setVertex(this.posBuffer, this.verts);

    // worldCoords buffer matches the same vertex order (TL, BL, TR, TR, BL, BR)
    EngineUtils.makeQuadVec2Buffered(this.coordsBuffer, xW, yW + sideLength, xW + sideLength, yW);
    worldCoordsA.setVertex(this.coordsBuffer, this.verts);

    this.bufferGradients(rect, PerlinOctave._0, p0topGrad, p0botGrad);
    this.bufferGradients(rect, PerlinOctave._1, p1topGrad, p1botGrad);
    this.bufferGradients(rect, PerlinOctave._2, p2topGrad, p2botGrad);

    this.verts += 6;
  }

  public queueChunk(chunk: Chunk) {
    // calculate gradients
    if (chunk.chunkFootprint.sideLength > this.config.scale) {
      const rects = getPerlinChunks(chunk.chunkFootprint, this.config.scale);
      for (const rect of rects) this.queueRect(rect);
    } else this.queueRect(chunk.chunkFootprint);
  }

  public setColorConfiguration(
    innerNebulaColor?: string,
    nebulaColor?: string,
    spaceColor?: string,
    deepSpaceColor?: string,
    deadSpaceColor?: string
  ) {
    // convert from hex to vec3 and cache
    this.colors.innerNebulaColor = hexToRgb(innerNebulaColor || fallbackColor);
    this.colors.nebulaColor = hexToRgb(nebulaColor || fallbackColor);
    this.colors.spaceColor = hexToRgb(spaceColor || fallbackColor);
    this.colors.deepSpaceColor = hexToRgb(deepSpaceColor || fallbackColor);
    this.colors.deadSpaceColor = hexToRgb(deadSpaceColor || fallbackColor);
  }

  public setUniforms() {
    this.uniformSetters.matrix(this.manager.projectionMatrix);
    this.uniformSetters.lengthScale(this.config.scale);
    this.uniformSetters.thresholds(this.thresholds);

    const time = EngineUtils.getNow();
    this.uniformSetters.time(time);

    const viewport = this.manager.renderer.getViewport();
    this.uniformSetters.viewportZoom(viewport.scale);

    this.uniformSetters.innerNebulaColor(this.colors.innerNebulaColor);
    this.uniformSetters.nebulaColor(this.colors.nebulaColor);
    this.uniformSetters.spaceColor(this.colors.spaceColor);
    this.uniformSetters.deepSpaceColor(this.colors.deepSpaceColor);
    this.uniformSetters.deadSpaceColor(this.colors.deadSpaceColor);
  }
}
