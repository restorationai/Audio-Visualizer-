import { RenderSettings, AspectRatio } from '../types';

const FFMPEG_URL = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.7/dist/umd/ffmpeg.js';
const UTIL_URL = 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js';

let ffmpeg: any = null;

const RATIO_VALUES: Record<AspectRatio, number> = {
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '1:1': 1 / 1,
  '4:5': 4 / 5,
  '2:3': 2 / 3,
  '3:4': 3 / 4,
};

const loadFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;

  const loadScript = (url: string) => new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    document.head.appendChild(script);
  });

  await loadScript(FFMPEG_URL);
  await loadScript(UTIL_URL);

  const { FFmpeg } = (window as any).FFmpeg;
  ffmpeg = new FFmpeg();
  
  await ffmpeg.load({
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
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
    const ffmpegInstance = await loadFFmpeg();
    const { fetchFile } = (window as any).FFmpegUtil;

    await ffmpegInstance.writeFile('input.png', await fetchFile(image));
    
    const inputs = ['-i', 'input.png'];
    const filterParts = [];
    let audioInputCount = 0;

    if (audioA) {
      await ffmpegInstance.writeFile('audioA.mp3', await fetchFile(audioA));
      inputs.push('-i', 'audioA.mp3');
      audioInputCount++;
    }
    if (audioB) {
      await ffmpegInstance.writeFile('audioB.mp3', await fetchFile(audioB));
      inputs.push('-i', 'audioB.mp3');
      audioInputCount++;
    }

    // Resolution Calculation
    const baseDim = settings.resolution === '4K' ? 2160 : 1080;
    const ratio = RATIO_VALUES[settings.aspectRatio];
    
    let width = baseDim;
    let height = baseDim;

    if (ratio >= 1) { // Landscape or Square
      width = Math.floor(baseDim * ratio);
      height = baseDim;
    } else { // Portrait
      width = baseDim;
      height = Math.floor(baseDim / ratio);
    }
    
    width = (width >> 1) << 1; 
    height = (height >> 1) << 1;

    const vA = settings.visualizerA;
    const vB = settings.visualizerB;

    // FFmpeg showwaves color parsing: prefers 0xRRGGBB format
    const formatColor = (c: string) => `0x${c.replace('#', '')}`;

    filterParts.push(`[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[bg]`);

    let currentInputIdx = 1;
    let lastVideoLabel = '[bg]';

    if (audioA) {
      const ax = Math.floor((vA.x / 100) * width);
      const ay = Math.floor((vA.y / 100) * height);
      const aw = Math.max(2, (Math.floor((vA.width / 100) * width) >> 1) << 1);
      const ah = Math.max(2, (Math.floor((vA.height / 100) * height) >> 1) << 1);
      filterParts.push(`[${currentInputIdx}:a]showwaves=s=${aw}x${ah}:colors=${formatColor(vA.color)}:mode=line:rate=30,format=rgba,colorkey=0x000000:0.1[vA]`);
      filterParts.push(`${lastVideoLabel}[vA]overlay=${ax}:${ay}[tmpA]`);
      lastVideoLabel = '[tmpA]';
      currentInputIdx++;
    }

    if (audioB) {
      const bx = Math.floor((vB.x / 100) * width);
      const by = Math.floor((vB.y / 100) * height);
      const bw = Math.max(2, (Math.floor((vB.width / 100) * width) >> 1) << 1);
      const bh = Math.max(2, (Math.floor((vB.height / 100) * height) >> 1) << 1);
      filterParts.push(`[${currentInputIdx}:a]showwaves=s=${bw}x${bh}:colors=${formatColor(vB.color)}:mode=line:rate=30,format=rgba,colorkey=0x000000:0.1[vB]`);
      filterParts.push(`${lastVideoLabel}[vB]overlay=${bx}:${by}[v]`);
      lastVideoLabel = '[v]';
      currentInputIdx++;
    } else if (audioA) {
      // Finalize the label if only A was used
      filterParts[filterParts.length - 1] = filterParts[filterParts.length - 1].replace('[tmpA]', '[v]');
    } else {
      filterParts.push(`[bg]null[v]`);
    }

    // Audio mixing
    if (audioInputCount === 2) {
      filterParts.push(`[1:a][2:a]amix=inputs=2:duration=longest:dropout_transition=0[a]`);
    } else if (audioInputCount === 1) {
      filterParts.push(`[1:a]anull[a]`);
    }

    const filter = filterParts.join('; ');

    ffmpegInstance.on('progress', ({ progress }: { progress: number }) => {
      onProgress(Math.floor(20 + (progress * 80)));
    });

    const execArgs = [
      ...inputs,
      '-filter_complex', filter,
      '-map', '[v]'
    ];
    
    if (audioInputCount > 0) {
      execArgs.push('-map', '[a]');
    }

    execArgs.push(
      '-c:v', 'libx264', 
      '-preset', 'ultrafast', 
      '-pix_fmt', 'yuv420p',
      '-shortest', 'output.mp4'
    );

    await ffmpegInstance.exec(execArgs);

    const data = await ffmpegInstance.readFile('output.mp4');
    onProgress(100);
    return URL.createObjectURL(new Blob([(data as any).buffer], { type: 'video/mp4' }));
  } catch (error: any) {
    console.error(error);
    throw new Error(`Render Failed: ${error.message}`);
  }
};