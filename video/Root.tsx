import type { FC } from 'react';
import { Composition, Folder } from 'remotion';
import { IntuneHydrationAd } from './IntuneHydrationAd';

export const RemotionRoot: FC = () => (
  <Folder name="Marketing">
    <Composition
      id="IntuneHydrationKit-Ad"
      component={IntuneHydrationAd}
      durationInFrames={720}
      fps={30}
      width={1080}
      height={1920}
    />
  </Folder>
);
