export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5' | '2:3' | '3:4';
export type Resolution = '1080p' | '4K';
export type DragMode = 'move' | 'resize-n' | 'resize-s' | 'resize-e' | 'resize-w' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | null;

export interface VisualizerData {
  id: 'A' | 'B';
  x: number; // percentage
  y: number; // percentage
  width: number; // percentage
  height: number; // percentage
  color: string; // hex string
}

export interface RenderSettings {
  resolution: Resolution;
  aspectRatio: AspectRatio;
  visualizerA: VisualizerData;
  visualizerB: VisualizerData;
}