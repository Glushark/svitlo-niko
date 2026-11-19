(() => {
  'use strict';

  const script = document.currentScript;
  const videoUrl = new URL('./assets/space-background.mp4', script.src).href;

  const style = document.createElement('style');
  style.textContent = `
    html { background-color: #070611 !important; }
    body { position: relative !important; z-index: 0 !important; background-color: transparent !important; background-image: none !important; }
    #space-background-video, #space-background-shade {
      position: fixed; inset: auto; top: 50%; left: 50%; width: 100vw; height: 100vh;
      pointer-events: none; transform: translate(-50%, -50%);
    }
    #space-background-video { z-index: -2; object-fit: cover; opacity: .56; filter: brightness(.78) saturate(1.12); }
    #space-background-shade { z-index: -1; background: rgba(7, 5, 18, .48); }
    @media (max-width: 700px) and (orientation: portrait) {
      #space-background-video { width: 100vh; height: 100vw; width: 100dvh; height: 100vw; transform: translate(-50%, -50%) rotate(90deg); }
    }
    @media (prefers-reduced-motion: reduce) { #space-background-video { display: none; } }
  `;
  document.head.append(style);

  const video = document.createElement('video');
  video.id = 'space-background-video';
  video.src = videoUrl;
  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('webkit-playsinline', '');

  const shade = document.createElement('div');
  shade.id = 'space-background-shade';
  shade.setAttribute('aria-hidden', 'true');

  const addBackdrop = () => {
    document.body.prepend(shade);
    document.body.prepend(video);
    const play = video.play();
    if (play && typeof play.catch === 'function') play.catch(() => {});
  };

  if (document.body) addBackdrop();
  else document.addEventListener('DOMContentLoaded', addBackdrop, { once: true });
})();
