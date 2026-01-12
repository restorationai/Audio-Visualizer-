import { RenderSettings, AspectRatio } from '../types';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

const RATIO_VALUES: Record<AspectRatio, number> = {
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '1:1': 1,
  '4:5': 4 / 5,
  '2:3': 2 / 3,
  '3:4': 3 / 4,
};

const loadFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
};

export const renderVideo = async (
  image: File,
  audioA: File | null,
  audioB: File | null,
  settings: RenderSettings,
  onProgress: (progress: number) => void
): Promise<string> => {
  try {
    onProgress(5);

    const ffmpeg = await loadFFmpeg();

    await ffmpeg.writeFile('input.png', await fetchFile(image));

    const inputs: string[] = ['-i', 'input.png'];
    let audioCount = 0;

    if (audioA) {
      await ffmpeg.writeFile('a.mp3', await fetchFile(audioA));
      inputs.push('-i', 'a.mp3');
      audioCount++;
    }

    if (audioB) {
      await ffmpeg.writeFile('b.mp3', await fetchFile(audioB));
      inputs.push('-i', 'b.mp3');
      audioCount++;
    }

    const base = settings.resolution === '4K' ? 2160 : 1080;
    const ratio = RATIO_VALUES[settings.aspectRatio];

    let width = ratio >= 1 ? Math.floor(base * ratio) : base;
    let height = ratio >= 1 ? base : Math.floor(base / ratio);

    width = (width >> 1) << 1;
    height = (height >> 1) << 1;

    const vA = settings.visualizerA;
    const vB = settings.visualizerB;

    const fx: string[] = [
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[bg]`
    ];

    let idx = 1;
    let last = '[bg]';

    if (audioA) {
      fx.push(
        `[${idx}:a]showwaves=s=${Math.floor(width * vA.width / 100)}x${Math.floor(height * vA.height / 100)}:colors=0x${vA.color.replace('#','')}:mode=line,format=rgba[vA]`,
        `${last}[vA]overlay=${Math.floor(width * vA.x / 100)}:${Math.floor(height * vA.y / 100)}[tmpA]`
      );
      last = '[tmpA]';
      idx++;
    }

    if (audioB) {
      fx.push(
        `[${idx}:a]showwaves=s=${Math.floor(width * vB.width / 100)}x${Math.floor(height * vB.height / 100)}:colors=0x${vB.color.replace('#','')}:mode=line,format=rgba[vB]`,
        `${last}[vB]overlay=${Math.floor(width * vB.x / 100)}:${Math.floor(height * vB.y / 100)}[v]`
      );
    } else {
      fx.push(`${last}null[v]`);
    }

    if (audioCount === 2) {
      fx.push(`[1:a][2:a]amix=inputs=2[a]`);
    } else if (audioCount === 1) {
      fx.push(`[1:a]anull[a]`);
    }

    ffmpeg.on('progress', ({ progress }) => {
      onProgress(20 + Math.floor(progress * 80));
    });

    await ffmpeg.exec([
      ...inputs,
      '-filter_complex', fx.join(';'),
      '-map', '[v]',
      ...(audioCount ? ['-map', '[a]'] : []),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-shortest',
      'out.mp4'
    ]);

    const data = await ffmpeg.readFile('out.mp4');
    onProgress(100);

    return URL.createObjectURL(
      new Blob([data.buffer], { type: 'video/mp4' })
    );

  } catch (err: any) {
    console.error(err);
    throw new Error(`Render failed: ${err.message}`);
  }
};
