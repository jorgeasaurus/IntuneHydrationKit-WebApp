import React from 'react';
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const COLORS = {
  ink: '#06152d',
  blue: '#1264ff',
  cyan: '#57e3ff',
  mint: '#51f2b1',
  sun: '#ffe66b',
  paper: '#f5f9ff',
  muted: '#a9c3e9',
};

const appear = (frame: number, fps: number, delay = 0, duration = 18) =>
  spring({
    frame: frame - delay,
    fps,
    durationInFrames: duration,
    config: { damping: 200 },
  });

const FadeUp: React.FC<React.PropsWithChildren<{ delay?: number; distance?: number }>> = ({
  children,
  delay = 0,
  distance = 42,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = appear(frame, fps, delay);

  return (
    <div
      style={{
        opacity: progress,
        translate: `0 ${interpolate(progress, [0, 1], [distance, 0])}px`,
      }}
    >
      {children}
    </div>
  );
};

const GridBackground: React.FC<{ tint?: string }> = ({ tint = COLORS.blue }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drift = (frame / fps) * 24;
  const pulse = 0.15 + Math.sin(frame / 18) * 0.05;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          width: 1250,
          height: 1250,
          borderRadius: '50%',
          background: tint,
          filter: 'blur(120px)',
          opacity: pulse,
          top: -420 + drift,
          right: -470 + drift / 2,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: -140,
          backgroundImage:
            'linear-gradient(rgba(101, 170, 255, 0.13) 2px, transparent 2px), linear-gradient(90deg, rgba(101, 170, 255, 0.13) 2px, transparent 2px)',
          backgroundSize: '72px 72px',
          transform: `translate(${-drift}px, ${drift}px) rotate(-7deg)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(6, 21, 45, 0.12) 0%, rgba(6, 21, 45, 0.74) 76%, #06152d 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = COLORS.cyan }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 14,
      color,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: 800,
      fontSize: 25,
      letterSpacing: 4,
      textTransform: 'uppercase',
    }}
  >
    <span style={{ width: 42, height: 4, backgroundColor: color, borderRadius: 99 }} />
    {children}
  </div>
);

const BrowserFrame: React.FC<React.PropsWithChildren<{ scale?: number; rotate?: number }>> = ({
  children,
  scale = 1,
  rotate = 0,
}) => (
  <div
    style={{
      width: 1230,
      padding: 16,
      borderRadius: 34,
      scale,
      rotate: `${rotate}deg`,
      background: 'linear-gradient(145deg, #e9f3ff, #8aa4d1)',
      boxShadow: '0 38px 100px rgba(0, 0, 0, 0.45)',
    }}
  >
    <div
      style={{
        overflow: 'hidden',
        borderRadius: 20,
        background: COLORS.paper,
        color: COLORS.ink,
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      {children}
    </div>
  </div>
);

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoIn = appear(frame, fps, 5);
  const scale = interpolate(logoIn, [0, 1], [0.72, 1]);
  const strike = interpolate(frame, [76, 102], [0, 100], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <GridBackground tint={COLORS.cyan} />
      <div style={{ padding: '126px 76px', position: 'relative' }}>
        <FadeUp delay={2}><Eyebrow>Intune admins, be honest</Eyebrow></FadeUp>
        <FadeUp delay={15}>
          <div style={{ marginTop: 68, color: COLORS.paper, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 92, fontWeight: 900, lineHeight: 0.96, letterSpacing: -5 }}>
            YOU DON&apos;T<br />NEED ANOTHER<br /><span style={{ color: COLORS.sun }}>9AM TICKET.</span>
          </div>
        </FadeUp>
        <FadeUp delay={39}>
          <div style={{ position: 'relative', display: 'inline-block', marginTop: 44, color: COLORS.muted, fontSize: 37, fontWeight: 700, letterSpacing: -1 }}>
            "Can you configure the tenant?"
            <div style={{ position: 'absolute', top: '53%', left: -8, width: `${strike}%`, height: 9, borderRadius: 99, background: COLORS.mint, transform: 'rotate(-5deg)' }} />
          </div>
        </FadeUp>
      </div>
      <div style={{ position: 'absolute', bottom: 126, left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `scale(${scale})` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 25, padding: '30px 42px', border: '2px solid rgba(131, 224, 255, 0.35)', background: 'rgba(11, 37, 73, 0.72)', borderRadius: 32, color: COLORS.paper, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 30, fontWeight: 900 }}>
          <span style={{ color: COLORS.mint, fontSize: 38 }}>↗</span> There&apos;s a safer flow.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Workflow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const screen = appear(frame, fps, 13, 26);
  const card = appear(frame, fps, 42, 20);

  return (
    <AbsoluteFill>
      <GridBackground tint={COLORS.blue} />
      <div style={{ position: 'relative', padding: '106px 76px 0' }}>
        <FadeUp delay={0}><Eyebrow color={COLORS.mint}>The real desktop console</Eyebrow></FadeUp>
        <FadeUp delay={8}>
          <div style={{ marginTop: 34, color: COLORS.paper, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 75, lineHeight: 1, fontWeight: 900, letterSpacing: -4 }}>
            SCOPE.<br /><span style={{ color: COLORS.cyan }}>EXECUTE.</span><br />REPORT.
          </div>
        </FadeUp>
      </div>
      <div style={{ position: 'absolute', top: 620, left: -58, opacity: screen, translate: `0 ${interpolate(screen, [0, 1], [130, 0])}px`, scale: interpolate(screen, [0, 1], [0.9, 1]) }}>
        <BrowserFrame rotate={-3} scale={0.84}>
          <Img src={staticFile('video/desktop-landing-hero-dark.png')} style={{ display: 'block', width: '100%' }} />
        </BrowserFrame>
      </div>
      <div style={{ position: 'absolute', right: 64, bottom: 116, opacity: card, transform: `translateY(${interpolate(card, [0, 1], [48, 0])}px)` }}>
        <div style={{ width: 420, padding: 26, borderRadius: 25, background: COLORS.mint, color: COLORS.ink, fontFamily: 'Arial, Helvetica, sans-serif', boxShadow: '0 24px 55px rgba(0,0,0,.3)' }}>
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 2 }}>ACTUAL PRODUCT VIEW</div>
          <div style={{ marginTop: 8, fontSize: 27, lineHeight: 1.05, fontWeight: 900 }}>Live run preview, captured on desktop.</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Proof: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const screen = appear(frame, fps, 9, 25);
  const footer = appear(frame, fps, 66, 20);

  return (
    <AbsoluteFill>
      <GridBackground tint={COLORS.mint} />
      <div style={{ position: 'relative', padding: '112px 76px 0' }}>
        <FadeUp delay={0}><Eyebrow color={COLORS.sun}>Desktop product view</Eyebrow></FadeUp>
        <FadeUp delay={9}>
          <div style={{ marginTop: 34, color: COLORS.paper, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 67, lineHeight: 1.02, fontWeight: 900, letterSpacing: -3.5 }}>
            INSPECT EVERY<br /><span style={{ color: COLORS.mint }}>PAYLOAD.</span>
          </div>
        </FadeUp>
      </div>
      <div style={{ position: 'absolute', top: 610, left: -58, opacity: screen, translate: `0 ${interpolate(screen, [0, 1], [90, 0])}px`, scale: interpolate(screen, [0, 1], [0.9, 1]) }}>
        <BrowserFrame rotate={3} scale={0.84}>
          <Img src={staticFile('video/desktop-landing-operating-model-dark.png')} style={{ display: 'block', width: '100%' }} />
        </BrowserFrame>
      </div>
      <div style={{ position: 'fixed', top: 1650, left: 76, right: 76, padding: '22px 28px', color: COLORS.ink, background: COLORS.sun, borderRadius: 24, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 26, fontWeight: 900, textAlign: 'center', opacity: footer, transform: `translateY(${interpolate(footer, [0, 1], [42, 0])}px)` }}>
        Safeguards, smart skips, and operator evidence—on one screen.
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mark = appear(frame, fps, 10, 28);
  const logo = appear(frame, fps, 42, 24);
  const cta = appear(frame, fps, 70, 22);
  const sheen = interpolate(frame, [83, 125], [-420, 500], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <GridBackground tint={COLORS.blue} />
      <div style={{ position: 'relative', height: '100%', padding: '170px 76px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <div style={{ opacity: mark, transform: `scale(${interpolate(mark, [0, 1], [0.55, 1])})`, width: 176, height: 176, display: 'grid', placeItems: 'center', border: `8px solid ${COLORS.mint}`, borderRadius: 46, color: COLORS.mint, fontSize: 106, fontWeight: 900 }}>↗</div>
        <div style={{ marginTop: 64, color: COLORS.paper, fontSize: 94, lineHeight: 0.93, fontWeight: 900, letterSpacing: -5, opacity: logo, transform: `translateY(${interpolate(logo, [0, 1], [46, 0])}px)` }}>
          HYDRATE WITH<br /><span style={{ color: COLORS.cyan }}>CONFIDENCE.</span>
        </div>
        <div style={{ marginTop: 48, color: COLORS.muted, fontSize: 33, lineHeight: 1.25, fontWeight: 700, opacity: cta }}>The web app for bootstrapping Intune tenants with clarity, control, and safeguards.</div>
        <div style={{ position: 'relative', overflow: 'hidden', marginTop: 100, width: '100%', padding: '31px 26px', borderRadius: 28, color: COLORS.ink, background: COLORS.mint, fontSize: 30, fontWeight: 900, opacity: cta, transform: `translateY(${interpolate(cta, [0, 1], [38, 0])}px)` }}>
          EXPLORE THE HYDRATION KIT
          <div style={{ position: 'absolute', top: -20, left: sheen, width: 130, height: 110, background: 'rgba(255,255,255,.6)', transform: 'rotate(22deg)' }} />
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 18, opacity: cta }}>
          <Img src={staticFile('IHTLogoClear.png')} style={{ width: 66, height: 66, objectFit: 'contain' }} />
          <div style={{ color: COLORS.paper, textAlign: 'left', fontSize: 22, lineHeight: 1.05, fontWeight: 900, letterSpacing: 1 }}>INTUNE<br />HYDRATION KIT</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const IntuneHydrationAd: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={0} durationInFrames={180} premountFor={30}><Intro /></Sequence>
    <Sequence from={170} durationInFrames={190} premountFor={30}><Workflow /></Sequence>
    <Sequence from={350} durationInFrames={205} premountFor={30}><Proof /></Sequence>
    <Sequence from={540} durationInFrames={180} premountFor={30}><Outro /></Sequence>
  </AbsoluteFill>
);
