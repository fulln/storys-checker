import React from 'react';
import { Composition, Folder, Still } from 'remotion';
import { Demo } from './scenes/Demo';
import { CoverDemo3x4 } from './covers/CoverDemo3x4';
import { CoverDemo6x7 } from './covers/CoverDemo6x7';

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="TwentyYearsAgo">
      <Composition id="Demo-2006-01-01" component={Demo} durationInFrames={1650} fps={30} width={1080} height={1920} />
    </Folder>
    <Folder name="Covers">
      <Still id="Cover-Demo-3x4" component={CoverDemo3x4} width={1080} height={1440} />
      <Still id="Cover-Demo-6x7" component={CoverDemo6x7} width={1080} height={1260} />
    </Folder>
  </>
);
