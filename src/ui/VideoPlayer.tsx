import React, { useEffect, useRef } from 'react';
// import the asset URL so Vite replaces it with the correct dev/prod path
// @ts-ignore
import jsmpegUrl from '../lib/jsmpeg.min.js?url';

interface VideoPlayerProps {
  url: string;
  className?: string;
}

async function ensureJSMpegLoaded(): Promise<void> {
  // If already available, resolve immediately
  if ((window as any).JSMpeg) return;

  // Prevent multiple concurrent loads
  const existing = (window as any).__JSMpegLoading as Promise<void> | undefined;
  if (existing) return existing;

      const p = new Promise<void>((resolve, reject) => {
    try {
      const script = document.createElement('script');
      // Use the asset URL imported via Vite so it works in dev and production
      script.src = jsmpegUrl;
      script.async = true;
      script.onload = () => {
        // jsmpeg defines a global `JSMpeg` var; ensure it's exposed on window
        if ((window as any).JSMpeg) {
          resolve();
        } else if ((window as any).jsmpeg) {
          // some builds export lowercase
          (window as any).JSMpeg = (window as any).jsmpeg;
          resolve();
        } else {
          reject(new Error('JSMpeg script loaded but global not found'));
        }
      };
      script.onerror = (e) => reject(new Error('Failed to load JSMpeg script'));
      document.head.appendChild(script);
    } catch (e) {
      reject(e);
    }
  });

  (window as any).__JSMpegLoading = p;
  return p.finally(() => { (window as any).__JSMpegLoading = undefined; });
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ url, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    if (!canvasRef.current || !url) return;

    // Destroy previous player if exists
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch (_) { }
      playerRef.current = null;
    }

    (async () => {
      try {
        await ensureJSMpegLoaded();
        if (!mounted) return;
        const JSMpeg = (window as any).JSMpeg;
        if (!JSMpeg || !JSMpeg.Player) {
          console.error('JSMpeg not available after load');
          return;
        }

        // Initialize JSMpeg player
        // Accept both websocket mpeg-ts endpoints and http streams supported by JSMpeg
        playerRef.current = new JSMpeg.Player(url, {
          canvas: canvasRef.current,
          autoplay: true,
          audio: false,
          disableGl: false,
        });
      } catch (e) {
        console.error('Failed to init JSMpeg', e);
      }
    })();

    return () => {
      mounted = false;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) { }
        playerRef.current = null;
      }
    };
  }, [url]);

  return (
    <canvas ref={canvasRef} className={className} />
  );
};
