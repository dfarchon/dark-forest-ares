import { Chunk } from '@dfares/types';
import { EngineUtils } from '../EngineUtils';
import { MASK_PROGRAM_DEFINITION } from '../Programs/MaskProgram';
import { GameGLManager } from '../WebGL/GameGLManager';
import { GenericRenderer } from '../WebGL/GenericRenderer';

export class MaskRenderer extends GenericRenderer<typeof MASK_PROGRAM_DEFINITION> {
  manager: GameGLManager;
  bgCanvas: HTMLCanvasElement;
  quadBuffer: number[];
  perlinThresholds: number[];

  constructor(manager: GameGLManager) {
    super(manager, MASK_PROGRAM_DEFINITION);
    this.quadBuffer = EngineUtils.makeEmptyQuad();
    this.perlinThresholds = this.manager.renderer.context.getPerlinThresholds();
  }

  queueChunk(chunk: Chunk): void {
    const [t1, t2, t3] = this.perlinThresholds;

    /* draw using mask program */
    const viewport = this.manager.renderer.getViewport();

    const {
      chunkFootprint: { bottomLeft, sideLength },
      perlin,
    } = chunk;
    // Convert all 4 world corners to screen space for isometric support
    const cTL = viewport.worldToCanvasCoords({ x: bottomLeft.x, y: bottomLeft.y + sideLength });
    const cBL = viewport.worldToCanvasCoords(bottomLeft);
    const cTR = viewport.worldToCanvasCoords({
      x: bottomLeft.x + sideLength,
      y: bottomLeft.y + sideLength,
    });
    const cBR = viewport.worldToCanvasCoords({ x: bottomLeft.x + sideLength, y: bottomLeft.y });

    let color = 0; // 0 is nebula, 3 is dead space

    if (perlin > t1) color = 1;
    if (perlin > t2) color = 2;
    if (perlin > t3) color = 3;

    const { position } = this.attribManagers;

    // Build 3D quad (z = color) as 2 triangles: TL, BL, TR, TR, BL, BR
    const b = this.quadBuffer;
    b[0] = cTL.x; b[1] = cTL.y; b[2] = color;
    b[3] = cBL.x; b[4] = cBL.y; b[5] = color;
    b[6] = cTR.x; b[7] = cTR.y; b[8] = color;
    b[9] = cTR.x; b[10] = cTR.y; b[11] = color;
    b[12] = cBL.x; b[13] = cBL.y; b[14] = color;
    b[15] = cBR.x; b[16] = cBR.y; b[17] = color;
    position.setVertex(this.quadBuffer, this.verts);

    this.verts += 6;
  }

  public setUniforms() {
    this.uniformSetters.matrix(this.manager.projectionMatrix);
  }
}

// we'll need this code later for improved perlin
/*
  setStencil(stencil: boolean) {
    this.stencil = stencil;
    if (stencil) this.gl.enable(this.gl.STENCIL_TEST);
    else this.gl.disable(this.gl.STENCIL_TEST);
  }

  private checkStencil(): boolean {
    if (!this.stencil) {
      console.error('stencil not enabled!');
    }

    return this.stencil;
  }

  startMasking() {
    if (!this.checkStencil()) return;

    const gl = this.gl;
    gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE); // always update stencil
    gl.stencilFunc(gl.ALWAYS, 1, 0xff); // everything passes stencil test
    gl.stencilMask(0xff); // enable stencil writes
  }

  stopMasking() {
    if (!this.checkStencil()) return;

    const gl = this.gl;
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP); // never update stencil
    gl.stencilFunc(gl.EQUAL, 1, 0xff); // only pass if eq
    gl.stencilMask(0x00); // disable stencil writes
  }
  */
