declare module "vanta/dist/vanta.waves.min" {
  import type * as ThreeNamespace from "three";

  export type VantaWavesOptions = {
    backgroundAlpha?: number;
    backgroundColor?: number;
    color?: number;
    el: HTMLElement | string;
    gyroControls?: boolean;
    minHeight?: number;
    minWidth?: number;
    mouseControls?: boolean;
    scale?: number;
    scaleMobile?: number;
    shininess?: number;
    THREE: typeof ThreeNamespace;
    touchControls?: boolean;
    waveHeight?: number;
    waveSpeed?: number;
    zoom?: number;
  };

  export type VantaEffect = {
    destroy: () => void;
    resize?: () => void;
    setOptions?: (
      options: Partial<Omit<VantaWavesOptions, "el" | "THREE">>
    ) => void;
  };

  export default function WAVES(options: VantaWavesOptions): VantaEffect;
}
