import { BufferGeometry, Color, Float32BufferAttribute, OrthographicCamera, Points, Scene, ShaderMaterial, type WebGLRenderer } from "three";
import { rgbToHex, subscribeTheme } from "../theme";
import type { Viewport } from "./scene-layer";

/** A camera-independent background pass, composited beneath the splat pass. */
export class ParticleRibbon {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-5, 5, 3, -3, 0.1, 30);
  private readonly geometry = new BufferGeometry();
  private readonly material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      time: { value: 0 }, opacity: { value: 0 }, pixelRatio: { value: 1 },
      centerX: { value: 1.6 }, color: { value: new Color() },
    },
    vertexShader: `
      uniform float time, pixelRatio, centerX;
      varying float brightness, edgeFade;
      void main() {
        // Each point retains its place across the fabric while flowing along it.
        float u = fract(position.x + time * 0.018);
        float s = u * 2.0 - 1.0;
        float v = position.y;
        float phase = s * 4.4 + time * 0.22;
        vec3 center = vec3(centerX + 1.25 * sin(phase), s * 4.0,
                           0.65 * cos(phase));
        float twist = s * 6.5 + time * 0.16 + 0.45 * sin(s * 3.0 - time * 0.28);
        float width = 0.55 + 0.19 * sin(s * 3.2 + time * 0.2);
        vec3 across = vec3(cos(twist), 0.2 * sin(phase), sin(twist));
        vec3 p = center + across * v * width;
        p.x += 0.12 * sin(s * 11.0 + v * 2.0 - time * 0.65);
        p.z += 0.16 * sin(s * 9.0 + v * 3.0 - time * 0.5);
        p.y += 0.06 * sin(v * 5.0 + s * 8.0 + time * 0.4);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.0 + position.z * 1.4) * pixelRatio;
        brightness = 0.5 + 0.5 * position.z;
        edgeFade = (1.0 - smoothstep(0.75, 1.0, abs(v)))
                 * smoothstep(0.0, 0.09, u) * (1.0 - smoothstep(0.91, 1.0, u));
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      varying float brightness, edgeFade;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float soft = 1.0 - smoothstep(0.15, 1.0, d);
        gl_FragColor = vec4(color * brightness, soft * edgeFade * opacity * 0.65);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  private readonly points = new Points(this.geometry, this.material);
  private readonly unsubscribe: () => void;

  constructor(invalidate: () => void) {
    const positions = new Float32Array(22000 * 3);
    // Deterministic distribution; all subsequent animation happens on the GPU.
    let seed = 7919;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = random();
      positions[i + 1] = random() * 2 - 1;
      positions[i + 2] = random();
    }
    this.geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.camera.position.z = 10;
    this.unsubscribe = subscribeTheme(theme => {
      this.material.uniforms.color.value.set(rgbToHex(theme.tones.accent));
      invalidate();
    });
  }

  resize(viewport: Readonly<Viewport>): void {
    const halfWidth = 3 * viewport.width / viewport.height;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.updateProjectionMatrix();
    this.material.uniforms.centerX.value = viewport.width <= 700 ? halfWidth * 0.2 : halfWidth * 0.48;
    this.material.uniforms.pixelRatio.value = viewport.pixelRatio;
  }

  render(renderer: WebGLRenderer, progress: number, seconds: number): void {
    const t = Math.min(1, Math.max(0, (progress - 0.035) / 0.465));
    this.material.uniforms.opacity.value = t * t * (3 - 2 * t) * 0.7;
    this.material.uniforms.time.value = seconds;
    this.points.visible = t > 0;
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.unsubscribe();
    this.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}
