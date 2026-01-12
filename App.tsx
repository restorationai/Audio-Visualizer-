import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AspectRatio, Resolution, VisualizerData, RenderSettings, DragMode } from './types';
import { renderVideo } from './services/ffmpegService';

const RATIO_MAP: Record<AspectRatio, number> = {
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '1:1': 1 / 1,
  '4:5': 4 / 5,
  '2:3': 2 / 3,
  '3:4': 3 / 4,
};

const MIN_SIZE = 5;

const App: React.FC = () => {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [selectedId, setSelectedId] = useState<'A' | 'B' | null>(null);
  const [zoom, setZoom] = useState(1); 
  
  const [audioA, setAudioA] = useState<File | null>(null);
  const [audioB, setAudioB] = useState<File | null>(null);

  const [resolution, setResolution] = useState<Resolution>('1080p');
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);

  const [visualizers, setVisualizers] = useState<VisualizerData[]>([
    { id: 'A', x: 10, y: 30, width: 35, height: 40, color: '#3b82f6' }, 
    { id: 'B', x: 55, y: 30, width: 35, height: 40, color: '#6b7280' }, 
  ]);

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputARef = useRef<HTMLInputElement>(null);
  const audioInputBRef = useRef<HTMLInputElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const dragMode = useRef<DragMode>(null);
  const dragStart = useRef({ x: 0, y: 0, vX: 0, vY: 0, vW: 0, vH: 0 });

  const updateSize = useCallback(() => {
    if (!previewContainerRef.current) return;
    const containerWidth = previewContainerRef.current.clientWidth - 40; 
    const containerHeight = previewContainerRef.current.clientHeight - 140; 
    const ratio = RATIO_MAP[aspectRatio];
    let targetWidth = containerWidth;
    let targetHeight = targetWidth / ratio;
    if (targetHeight > containerHeight) {
      targetHeight = containerHeight;
      targetWidth = targetHeight * ratio;
    }
    setCanvasSize({ width: targetWidth, height: targetHeight });
  }, [aspectRatio]);

  useEffect(() => {
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [updateSize]);

  const handleFile = (file: File) => {
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
      setBgFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setBgImage(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const onMouseDown = (e: React.MouseEvent, id: 'A' | 'B', mode: DragMode) => {
    if (isRendering) return;
    e.stopPropagation();
    setSelectedId(id);
    dragMode.current = mode;
    const v = visualizers.find(vis => vis.id === id);
    if (!v) return;
    dragStart.current = { x: e.clientX, y: e.clientY, vX: v.x, vY: v.y, vW: v.width, vH: v.height };
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragMode.current || !selectedId || !canvasSize.width || !canvasSize.height) return;
    const deltaX = ((e.clientX - dragStart.current.x) / (canvasSize.width * zoom)) * 100;
    const deltaY = ((e.clientY - dragStart.current.y) / (canvasSize.height * zoom)) * 100;

    setVisualizers(prev => prev.map(v => {
      if (v.id !== selectedId) return v;
      const currentStart = dragStart.current;
      switch (dragMode.current) {
        case 'move':
          v.x = Math.max(0, Math.min(100 - v.width, currentStart.vX + deltaX));
          v.y = Math.max(0, Math.min(100 - v.height, currentStart.vY + deltaY));
          break;
        case 'resize-e': v.width = Math.max(MIN_SIZE, Math.min(100 - v.x, currentStart.vW + deltaX)); break;
        case 'resize-w':
          const newWidthW = Math.max(MIN_SIZE, Math.min(currentStart.vW + currentStart.vX, currentStart.vW - deltaX));
          v.x = currentStart.vX + (currentStart.vW - newWidthW);
          v.width = newWidthW;
          break;
        case 'resize-s': v.height = Math.max(MIN_SIZE, Math.min(100 - v.y, currentStart.vH + deltaY)); break;
        case 'resize-n':
          const newHeightN = Math.max(MIN_SIZE, Math.min(currentStart.vH + currentStart.vY, currentStart.vH - deltaY));
          v.y = currentStart.vY + (currentStart.vH - newHeightN);
          v.height = newHeightN;
          break;
        case 'resize-se':
          v.width = Math.max(MIN_SIZE, Math.min(100 - v.x, currentStart.vW + deltaX));
          v.height = Math.max(MIN_SIZE, Math.min(100 - v.y, currentStart.vH + deltaY));
          break;
        case 'resize-sw':
          const swW = Math.max(MIN_SIZE, Math.min(currentStart.vW + currentStart.vX, currentStart.vW - deltaX));
          v.x = currentStart.vX + (currentStart.vW - swW);
          v.width = swW;
          v.height = Math.max(MIN_SIZE, Math.min(100 - v.y, currentStart.vH + deltaY));
          break;
        case 'resize-ne':
          v.width = Math.max(MIN_SIZE, Math.min(100 - v.x, currentStart.vW + deltaX));
          const neH = Math.max(MIN_SIZE, Math.min(currentStart.vH + currentStart.vY, currentStart.vH - deltaY));
          v.y = currentStart.vY + (currentStart.vH - neH);
          v.height = neH;
          break;
        case 'resize-nw':
          const nwW = Math.max(MIN_SIZE, Math.min(currentStart.vW + currentStart.vX, currentStart.vW - deltaX));
          const nwH = Math.max(MIN_SIZE, Math.min(currentStart.vH + currentStart.vY, currentStart.vH - deltaY));
          v.x = currentStart.vX + (currentStart.vW - nwW);
          v.y = currentStart.vY + (currentStart.vH - nwH);
          v.width = nwW;
          v.height = nwH;
          break;
      }
      return { ...v };
    }));
  }, [selectedId, canvasSize, zoom]);

  const onMouseUp = useCallback(() => { dragMode.current = null; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const updateVisualizerProperty = (id: 'A' | 'B', property: keyof VisualizerData, value: number | string) => {
    setVisualizers(prev => prev.map(v => {
      if (v.id !== id) return v;
      const updated = { ...v, [property]: value };
      if (property === 'x') updated.x = Math.max(0, Math.min(100 - updated.width, Number(value)));
      if (property === 'y') updated.y = Math.max(0, Math.min(100 - updated.height, Number(value)));
      if (property === 'width') updated.width = Math.max(MIN_SIZE, Math.min(100 - updated.x, Number(value)));
      if (property === 'height') updated.height = Math.max(MIN_SIZE, Math.min(100 - updated.y, Number(value)));
      return updated;
    }));
  };

  const handleExecuteRender = async () => {
    if (!bgFile) return;
    setIsRendering(true);
    setRenderProgress(0);
    setRenderedUrl(null);
    try {
      const settings: RenderSettings = {
        resolution,
        aspectRatio,
        visualizerA: visualizers[0],
        visualizerB: visualizers[1],
      };
      const videoUrl = await renderVideo(bgFile, audioA, audioB, settings, setRenderProgress);
      setRenderedUrl(videoUrl);
    } catch (err) {
      alert("Render failed. Check console for details.");
    } finally {
      setIsRendering(false);
    }
  };

  const isReadyToRender = !!bgImage && (!!audioA || !!audioB);
  const selectedVisualizer = visualizers.find(v => v.id === selectedId);

  return (
    <div className={`flex h-screen w-screen overflow-hidden transition-colors duration-200 ${isDraggingFile ? 'bg-blue-50' : 'bg-gray-100'}`}
      onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDraggingFile(false); }}
      onDrop={(e) => { e.preventDefault(); setIsDraggingFile(false); if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]); }}
    >
      <div className="w-[40%] h-full border-r border-gray-300 bg-gray-50 flex flex-col shadow-lg z-10">
        <div className="p-4 border-b border-gray-200 bg-white">
          <h1 className="text-lg font-semibold text-gray-800 uppercase tracking-tight">Editor Panel</h1>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-white/50">
            <h2 className="text-sm font-bold text-gray-700 mb-2">Background Image</h2>
            <div className="flex flex-col gap-3">
              <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} accept="image/png, image/jpeg" className="hidden" />
              <button disabled={isRendering} onClick={() => fileInputRef.current?.click()}
                className={`w-full py-2 px-4 bg-white border border-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm flex items-center justify-center gap-2 ${isRendering ? 'opacity-50 cursor-not-allowed' : ''}`}>
                Upload Image
              </button>
            </div>
          </div>
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700 mb-2">Audio Files</h2>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <input type="file" ref={audioInputARef} onChange={(e) => e.target.files?.[0] && setAudioA(e.target.files[0])} accept="audio/mpeg, audio/wav" className="hidden" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Audio A</span>
                  <span className={`text-[10px] font-medium italic ${audioA ? 'text-green-600' : 'text-blue-500'}`}>{audioA ? 'Ready' : 'No audio'}</span>
                </div>
                <button disabled={isRendering} onClick={() => audioInputARef.current?.click()}
                  className="w-full py-2 px-3 bg-white border border-gray-200 text-gray-700 rounded text-xs font-medium hover:bg-gray-50 transition-colors shadow-sm flex items-center justify-between">
                  <span className="truncate max-w-[80%]">{audioA ? audioA.name : 'Upload Audio A'}</span>
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                <input type="file" ref={audioInputBRef} onChange={(e) => e.target.files?.[0] && setAudioB(e.target.files[0])} accept="audio/mpeg, audio/wav" className="hidden" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Audio B</span>
                  <span className={`text-[10px] font-medium italic ${audioB ? 'text-green-600' : 'text-blue-500'}`}>{audioB ? 'Ready' : 'No audio'}</span>
                </div>
                <button disabled={isRendering} onClick={() => audioInputBRef.current?.click()}
                  className="w-full py-2 px-3 bg-white border border-gray-200 text-gray-700 rounded text-xs font-medium hover:bg-gray-50 transition-colors shadow-sm flex items-center justify-between">
                  <span className="truncate max-w-[80%]">{audioB ? audioB.name : 'Upload Audio B'}</span>
                </button>
              </div>
            </div>
          </div>
          <div className="p-4 border-b border-gray-200 bg-white/50">
            <h2 className="text-sm font-bold text-gray-700 mb-2">Canvas Settings</h2>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(RATIO_MAP) as AspectRatio[]).map((ratio) => (
                <button key={ratio} disabled={isRendering} onClick={() => setAspectRatio(ratio)}
                  className={`px-2 py-2 text-xs font-medium border rounded ${aspectRatio === ratio ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-300'}`}>
                  {ratio}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700 mb-1">Visualizer Settings</h2>
            {selectedVisualizer ? (
              <div className="flex flex-col gap-4 mt-3 p-3 bg-white border border-gray-200 rounded shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-800 font-bold uppercase tracking-wider">Editing: {selectedId}</p>
                  <input type="color" disabled={isRendering} value={selectedVisualizer.color} onChange={(e) => updateVisualizerProperty(selectedId!, 'color', e.target.value)} className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {['x', 'y', 'width', 'height'].map(prop => (
                    <div key={prop} className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-400 uppercase font-bold">{prop} (%)</label>
                      <input type="number" disabled={isRendering} value={Math.round(selectedVisualizer[prop as keyof VisualizerData] as number)} onChange={(e) => updateVisualizerProperty(selectedId!, prop as any, Number(e.target.value))} className="text-xs border border-gray-200 rounded px-2 py-1 font-mono" />
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-xs text-gray-500 italic mt-2 text-center p-4 border border-dashed border-gray-200 rounded">Select a visualizer on the preview</p>}
          </div>
          <div className="p-4 border-b border-gray-200 bg-white/50">
            <h2 className="text-sm font-bold text-gray-700 mb-2">Output Settings</h2>
            <div className="flex gap-2">
              {['1080p', '4K'].map(res => (
                <button key={res} disabled={isRendering} onClick={() => setResolution(res as Resolution)} className={`flex-1 py-1.5 text-[10px] font-bold border rounded ${resolution === res ? 'bg-gray-800 text-white' : 'bg-white text-gray-400 border-gray-200'}`}>{res}</button>
              ))}
            </div>
          </div>
          <div className="p-4 mt-auto border-t border-gray-200 bg-white">
            {isRendering && (
              <div className="mb-4">
                <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                  <span>Rendering...</span>
                  <span>{renderProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${renderProgress}%` }}></div>
                </div>
              </div>
            )}
            {renderedUrl && (
              <a href={renderedUrl} download="visualizer-export.mp4" className="w-full mb-3 py-2 bg-green-600 text-white rounded font-bold uppercase tracking-widest text-center block text-sm shadow hover:bg-green-700">Download Video</a>
            )}
            <button disabled={!isReadyToRender || isRendering} onClick={handleExecuteRender}
              className={`w-full py-3 rounded font-bold uppercase tracking-widest border transition-all ${isRendering ? 'bg-gray-100 text-gray-400 border-gray-200' : isReadyToRender ? 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700' : 'bg-gray-200 text-gray-400 border-gray-300'}`}>
              {isRendering ? 'Processing' : 'Execute Render'}
            </button>
          </div>
        </div>
      </div>
      <div className="w-[60%] h-full bg-gray-200 flex flex-col" onClick={() => setSelectedId(null)}>
        <div className="p-4 border-b border-gray-300 flex justify-center bg-gray-50/80 backdrop-blur-sm shadow-sm z-10">
          <h2 className="text-lg font-semibold text-gray-800 uppercase tracking-tight">Preview</h2>
        </div>
        <div ref={previewContainerRef} className="flex-1 overflow-hidden flex flex-col items-center justify-center p-10 gap-8">
          <div style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px`, transform: `scale(${zoom})`, transition: dragMode.current ? 'none' : 'transform 0.2s ease-out' }}
            className={`bg-black shadow-2xl flex items-center justify-center border border-gray-700 relative overflow-hidden origin-center ${isRendering ? 'opacity-80 grayscale-[0.3]' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
            {bgImage ? <img src={bgImage} className="w-full h-full object-contain select-none pointer-events-none" /> : <p className="text-white/40 text-sm font-medium uppercase tracking-widest">Upload background image</p>}
            <div className="absolute inset-0">
              {visualizers.map((v) => {
                const isSelected = selectedId === v.id && !isRendering;
                return (
                  <div key={v.id} style={{ left: `${v.x}%`, top: `${v.y}%`, width: `${v.width}%`, height: `${v.height}%`, backgroundColor: v.color + '80', border: isSelected ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.3)', cursor: isRendering ? 'default' : 'move' }}
                    onMouseDown={(e) => onMouseDown(e, v.id, 'move')} className="absolute flex items-center justify-center group/vis transition-[border]">
                    <span className="text-white font-bold text-[10px] md:text-xs opacity-80 uppercase select-none pointer-events-none">Visualizer {v.id}</span>
                    {!isRendering && (
                      <div className="absolute inset-0 pointer-events-none group-hover/vis:opacity-100 opacity-0 transition-opacity">
                        <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-500 rounded-sm pointer-events-auto cursor-nw-resize" onMouseDown={(e) => onMouseDown(e, v.id, 'resize-nw')} />
                        <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-500 rounded-sm pointer-events-auto cursor-ne-resize" onMouseDown={(e) => onMouseDown(e, v.id, 'resize-ne')} />
                        <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-500 rounded-sm pointer-events-auto cursor-sw-resize" onMouseDown={(e) => onMouseDown(e, v.id, 'resize-sw')} />
                        <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-500 rounded-sm pointer-events-auto cursor-se-resize" onMouseDown={(e) => onMouseDown(e, v.id, 'resize-se')} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-4 bg-white/80 backdrop-blur-md px-6 py-2.5 rounded-full shadow-lg border border-gray-200 z-20" onClick={(e) => e.stopPropagation()}>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">Preview Zoom</label>
            <input type="range" min="0.5" max="1.5" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-32 accent-blue-600 cursor-pointer" />
            <span className="text-xs font-mono text-gray-700 min-w-[3rem] text-right">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(1)} className="text-[10px] bg-gray-200 hover:bg-gray-300 px-2 py-0.5 rounded text-gray-600 font-bold uppercase transition-colors">Reset</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;