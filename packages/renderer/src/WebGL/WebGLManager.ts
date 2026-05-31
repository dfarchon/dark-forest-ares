import { RGBAVec } from '@dfares/types';
import autoBind from 'auto-bind';
import { mat4 } from 'gl-matrix';

export class WebGLManager {
  public gl: WebGL2RenderingContext;
  public projectionMatrix: mat4;
  public canvas: HTMLCanvasElement;
  private texIdx = 0;

  constructor(canvas: HTMLCanvasElement, attr?: WebGLContextAttributes) {
    autoBind(this);

    this.canvas = canvas;
    const gl = this.canvas.getContext('webgl2', attr);
    if (!gl) {
      console.error('error getting webgl2 context');
      return;
    }
    this.gl = gl;

    this.projectionMatrix = mat4.create();
    this.setProjectionMatrix();
  }

  public setProjectionMatrix(): void {
    const height = this.canvas.height;
    const width = this.canvas.width;

    // Guard against a transient zero/NaN-sized canvas so 2/width and -2/height
    // never produce Infinity/NaN and corrupt the projection for a frame.
    if (!(width > 0) || !(height > 0)) return;

    const depth = 100; // arbitrary # which represents max zidx

    // projects xy onto clip space and also compresses z

    // prettier-ignore
    mat4.set(this.projectionMatrix, 
      2 / width, 0, 0, 0,
      0, -2 / height, 0, 0,
      0, 0, 1 / depth, 0, // TODO make it so that positive is in front
      -1, 1, 0, 1,
    );

    // the reason we don't put -1/depth is because it breaks RHR; we need to reverse all of our triangles
  }

  public clear(bits?: number, color?: RGBAVec) {
    const { gl, canvas } = this;
    gl.viewport(0, 0, canvas.width, canvas.height);

    if (color) gl.clearColor(...color);
    else gl.clearColor(0, 0, 0, 0);

    gl.clear(bits || gl.COLOR_BUFFER_BIT);
  }

  public getTexIdx(): number {
    return this.texIdx++;
  }
}
