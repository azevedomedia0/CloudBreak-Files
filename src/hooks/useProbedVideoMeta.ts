import { useEffect, useState } from 'react';
import type { FileItem, VideoMetadata } from '../types';
import { probeVideo } from '../services/mediaBridge';
import { mergeProbe, unknownVideoMeta } from '../utils/videoSpecs';

const cache = new Map<string, VideoMetadata>();

/**
 * The file's video details with the real values read by ffmpeg, for files on this computer (desktop app only).
 * Until they are read, or for files ffmpeg cannot reach, it is what the file already carries.
 */
export function useProbedVideoMeta(file: FileItem | null | undefined): VideoMetadata | undefined {
  const path = file?.localPath;
  const wanted = !!path && (file?.category === 'video' || file?.category === 'audio');
  const [probed, setProbed] = useState<VideoMetadata | undefined>(() => (wanted ? cache.get(path!) : undefined));

  useEffect(() => {
    if (!wanted) { setProbed(undefined); return; }
    const hit = cache.get(path!);
    if (hit) { setProbed(hit); return; }
    setProbed(undefined);
    let cancelled = false;
    void probeVideo(path!).then(probe => {
      if (!probe) return;
      const meta = mergeProbe(file?.videoMeta ?? unknownVideoMeta(), probe);
      cache.set(path!, meta);
      if (!cancelled) setProbed(meta);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, wanted]);

  return probed ?? file?.videoMeta;
}
