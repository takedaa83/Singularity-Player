import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { audioEngine } from '../../hooks/useAudioEngine';

interface RaymarchingVisualizerProps {
  shaderPreset?: 'cyberpunk' | 'fluid' | 'blackhole';
}

export const RaymarchingVisualizer: React.FC<RaymarchingVisualizerProps> = ({ shaderPreset = 'cyberpunk' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const vsSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // Audio-reactive fragment shader
    const fsSource = `
      precision mediump float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform float u_bass;
      uniform float u_treble;

      void main() {
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        st = st * 2.0 - 1.0;
        st.x *= u_resolution.x / u_resolution.y;

        float d = length(st);
        vec3 color = vec3(0.0);

        if (d < 0.8) {
          float ring = sin(d * 10.0 - u_time * 3.0 + u_bass * 5.0);
          color = vec3(0.5 + 0.5 * sin(u_time + st.x + u_bass), 0.2, 0.8 + 0.2 * u_treble) * ring;
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    function createShader(glCtx: WebGLRenderingContext, type: number, source: string) {
      const shader = glCtx.createShader(type)!;
      glCtx.shaderSource(shader, source);
      glCtx.compileShader(shader);
      return shader;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const posAttr = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const bassLoc = gl.getUniformLocation(program, 'u_bass');
    const trebleLoc = gl.getUniformLocation(program, 'u_treble');

    let animId: number;
    const freqData = new Uint8Array(64);

    const render = (time: number) => {
      const width = canvas.clientWidth * window.devicePixelRatio;
      const height = canvas.clientHeight * window.devicePixelRatio;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }

      const analyser = audioEngine.getAnalyser();
      let bass = 0.2;
      let treble = 0.2;

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(freqData);
        let bassSum = 0;
        let trebleSum = 0;
        for (let i = 0; i < 8; i++) bassSum += freqData[i];
        for (let i = 48; i < 64; i++) trebleSum += freqData[i];
        bass = bassSum / (8 * 255);
        treble = trebleSum / (16 * 255);
      }

      gl.uniform2f(resLoc, canvas.width, canvas.height);
      gl.uniform1f(timeLoc, time * 0.001);
      gl.uniform1f(bassLoc, bass);
      gl.uniform1f(trebleLoc, treble);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, shaderPreset]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-neutral-800 bg-black">
      <canvas ref={canvasRef} className="w-full h-full block" aria-hidden="true" />
    </div>
  );
};
