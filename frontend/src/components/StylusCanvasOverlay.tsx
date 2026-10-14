import React, { useRef, useState, useEffect, useCallback } from 'react';
import { getStroke } from 'perfect-freehand';
import {
  PenTool,
  Eraser,
  RotateCcw,
  RotateCw,
  Trash2,
  Save,
  CheckCircle,
  Eye,
  EyeOff,
  Palette,
  Minus,
  Sparkles,
  Lock,
  Unlock
} from 'lucide-react';

export interface StylusPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface StylusStroke {
  points: StylusPoint[];
  color: string;
  size: number;
  isEraser?: boolean;
}

interface StylusCanvasOverlayProps {
  actorId: string;
  actorName: string;
  isMobile?: boolean;
}

const PEN_COLORS = [
  '#f59e0b', // Amber / Gold
  '#ef4444', // Blood Red
  '#3b82f6', // Arcane Blue
  '#10b981', // Nature Green
  '#e2e8f0', // Chalk White
  '#9333ea', // Shadow Purple
  '#000000', // Ink Black
];

const PEN_SIZES = [
  { label: 'Fine', value: 3 },
  { label: 'Medium', value: 6 },
  { label: 'Broad', value: 12 },
];

function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return '';
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q']
  );
  d.push('Z');
  return d.join(' ');
}

export const StylusCanvasOverlay: React.FC<StylusCanvasOverlayProps> = ({
  actorId,
  actorName,
  isMobile = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [strokes, setStrokes] = useState<StylusStroke[]>([]);
  const [redoStack, setRedoStack] = useState<StylusStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<StylusStroke | null>(null);

  const [activeTool, setActiveTool] = useState<'pen' | 'eraser'>('pen');
  const [penColor, setPenColor] = useState<string>('#f59e0b');
  const [penSize, setPenSize] = useState<number>(4);
  const [palmRejection, setPalmRejection] = useState<boolean>(true);
  const [isOverlayVisible, setIsOverlayVisible] = useState<boolean>(true);
  // On mobile, default drawing mode to false so touches scroll the sheet; activate via FAB
  const [isDrawingActiveOnMobile, setIsDrawingActiveOnMobile] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'dirty'>('idle');

  // Load drawing strokes from backend on actor change
  useEffect(() => {
    let isCancelled = false;
    const fetchDrawing = async () => {
      try {
        const resp = await fetch(`/api/drawings/${actorId}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data && data.drawingJson && !isCancelled) {
          const parsed = JSON.parse(data.drawingJson);
          if (Array.isArray(parsed.strokes)) {
            setStrokes(parsed.strokes);
            setRedoStack([]);
            setSaveStatus('saved');
          }
        } else if (!isCancelled) {
          setStrokes([]);
          setRedoStack([]);
          setSaveStatus('idle');
        }
      } catch (err) {
        console.warn('Could not load character stylus drawing:', err);
      }
    };
    fetchDrawing();
    return () => {
      isCancelled = true;
    };
  }, [actorId]);

  // Redraw canvas whenever strokes or currentStroke changes
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderStroke = (stroke: StylusStroke) => {
      if (stroke.points.length === 0) return;

      const rawPoints = stroke.points.map(p => [p.x, p.y, p.pressure || 0.5]);
      const outline = getStroke(rawPoints, {
        size: stroke.size,
        thinning: 0.6,
        smoothing: 0.7,
        streamline: 0.55,
        easing: (t) => Math.sin((t * Math.PI) / 2),
      });

      if (!outline.length) return;

      const pathData = getSvgPathFromStroke(outline);
      const path2d = new Path2D(pathData);

      if (stroke.isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000000';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = stroke.color;
      }

      ctx.fill(path2d);
      ctx.globalCompositeOperation = 'source-over';
    };

    // Render completed strokes
    strokes.forEach(renderStroke);

    // Render active drawing stroke
    if (currentStroke) {
      renderStroke(currentStroke);
    }
  }, [strokes, currentStroke]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Resize canvas to match container dimensions
  useEffect(() => {
    const updateCanvasSize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
      redrawCanvas();
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [redrawCanvas]);

  // Save to backend with debounce
  const handleSave = async (strokesToSave: StylusStroke[]) => {
    try {
      setSaveStatus('saving');
      const payload = JSON.stringify({ strokes: strokesToSave });
      const resp = await fetch(`/api/drawings/${actorId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawingJson: payload }),
      });
      if (resp.ok) {
        setSaveStatus('saved');
      } else {
        setSaveStatus('dirty');
      }
    } catch (err) {
      console.error('Failed to save stylus drawing:', err);
      setSaveStatus('dirty');
    }
  };

  // Pointer event handlers with Apple Pencil & S-Pen pressure and palm rejection
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Palm rejection: if palm rejection is on and pointer is a touch (not stylus or primary mouse), ignore it
    if (palmRejection && e.pointerType === 'touch') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure !== undefined && e.pressure > 0 ? e.pressure : 0.5;

    const newStroke: StylusStroke = {
      points: [{ x, y, pressure }],
      color: penColor,
      size: activeTool === 'eraser' ? penSize * 4 : penSize,
      isEraser: activeTool === 'eraser',
    };

    setCurrentStroke(newStroke);
    setRedoStack([]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentStroke) return;
    if (palmRejection && e.pointerType === 'touch') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure !== undefined && e.pressure > 0 ? e.pressure : 0.5;

    setCurrentStroke(prev => {
      if (!prev) return null;
      return {
        ...prev,
        points: [...prev.points, { x, y, pressure }],
      };
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentStroke) return;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch (err) {}

    const updatedStrokes = [...strokes, currentStroke];
    setStrokes(updatedStrokes);
    setCurrentStroke(null);
    setSaveStatus('dirty');

    // Auto save
    handleSave(updatedStrokes);
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    const last = strokes[strokes.length - 1];
    const newStrokes = strokes.slice(0, -1);
    setStrokes(newStrokes);
    setRedoStack(prev => [...prev, last]);
    handleSave(newStrokes);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const newRedo = redoStack.slice(0, -1);
    const newStrokes = [...strokes, next];
    setRedoStack(newRedo);
    setStrokes(newStrokes);
    handleSave(newStrokes);
  };

  const handleClearAll = () => {
    if (!strokes.length) return;
    if (window.confirm('Clear all handwritten notes on this sheet?')) {
      setStrokes([]);
      setRedoStack([]);
      handleSave([]);
    }
  };

  const isInteractingWithCanvas = isMobile ? isDrawingActiveOnMobile : isOverlayVisible;

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Floating Stylus Toolbar: Hidden on mobile unless isDrawingActiveOnMobile is true */}
      {(!isMobile || isDrawingActiveOnMobile) && (
        <div className="sticky top-14 z-30 mb-2 flex flex-wrap items-center justify-between gap-2 bg-slate-900/95 backdrop-blur-md border border-slate-800 p-2 rounded-xl shadow-2xl">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Pen Tool Button */}
            <button
              onClick={() => setActiveTool('pen')}
              className={`min-h-[42px] px-3 rounded-lg flex items-center gap-2 text-xs font-bold transition select-none ${
                activeTool === 'pen'
                  ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/50'
                  : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
              }`}
              title="Stylus / Pen"
            >
              <PenTool className="w-4 h-4" />
              <span>Stylus</span>
            </button>

            {/* Eraser Tool Button */}
            <button
              onClick={() => setActiveTool('eraser')}
              className={`min-h-[42px] px-3 rounded-lg flex items-center gap-2 text-xs font-bold transition select-none ${
                activeTool === 'eraser'
                  ? 'bg-rose-500 text-white shadow-md ring-2 ring-rose-400/50'
                  : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
              }`}
              title="Eraser"
            >
              <Eraser className="w-4 h-4" />
              <span>Eraser</span>
            </button>

            {/* Color Palette (Pen Only) */}
            {activeTool === 'pen' && (
              <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
                {PEN_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setPenColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition transform active:scale-90 ${
                      penColor === c ? 'border-amber-400 scale-110 shadow-sm' : 'border-slate-700 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    title={`Color: ${c}`}
                  />
                ))}
              </div>
            )}

            {/* Stroke Size Selector */}
            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-xs text-slate-400">
              {PEN_SIZES.map(s => (
                <button
                  key={s.label}
                  onClick={() => setPenSize(s.value)}
                  className={`px-2 py-1 rounded font-medium transition ${
                    penSize === s.value ? 'bg-slate-800 text-amber-400 font-bold' : 'hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Palm Rejection Toggle */}
            <button
              onClick={() => setPalmRejection(!palmRejection)}
              className={`min-h-[42px] px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium border transition ${
                palmRejection
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-950 text-slate-400 border-slate-800'
              }`}
              title="Palm Rejection: Ignores resting hands & finger touches, accepting only Pen/Stylus input"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Palm Guard {palmRejection ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          {/* Action Controls: Undo, Redo, Clear, Toggle Visibility */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              disabled={strokes.length === 0}
              onClick={handleUndo}
              className="w-10 h-10 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 disabled:opacity-40 flex items-center justify-center transition border border-slate-800"
              title="Undo stroke"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              disabled={redoStack.length === 0}
              onClick={handleRedo}
              className="w-10 h-10 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 disabled:opacity-40 flex items-center justify-center transition border border-slate-800"
              title="Redo stroke"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              disabled={strokes.length === 0}
              onClick={handleClearAll}
              className="w-10 h-10 rounded-lg bg-slate-950 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 disabled:opacity-40 flex items-center justify-center transition border border-slate-800"
              title="Clear all ink"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsOverlayVisible(!isOverlayVisible)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition border ${
                isOverlayVisible
                  ? 'bg-slate-950 text-amber-400 border-slate-800'
                  : 'bg-slate-950 text-slate-600 border-slate-800'
              }`}
              title={isOverlayVisible ? 'Hide ink overlay' : 'Show ink overlay'}
            >
              {isOverlayVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>

            {isMobile && (
              <button
                onClick={() => setIsDrawingActiveOnMobile(false)}
                className="px-3 h-10 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center shadow-md ml-1"
              >
                Done
              </button>
            )}

            {/* Sync indicator */}
            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 ml-1">
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-emerald-400" title="Handwriting synced to Hub DB">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Synced</span>
                </span>
              )}
              {saveStatus === 'saving' && (
                <span className="text-amber-400 animate-pulse">Saving...</span>
              )}
              {saveStatus === 'dirty' && (
                <span className="text-slate-500">Unsaved</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Floating Ink Action Button (FAB) */}
      {isMobile && !isDrawingActiveOnMobile && (
        <button
          onClick={() => setIsDrawingActiveOnMobile(true)}
          className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-2xl active:scale-95 transition"
          title="Write / Draw Notes with Stylus"
        >
          <PenTool className="w-5 h-5" />
        </button>
      )}

      {/* Transparent Stylus Canvas Layer Mounted Directly Over Sheet */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`stylus-canvas absolute inset-0 z-20 w-full h-full cursor-crosshair transition-opacity duration-200 ${
          isOverlayVisible ? 'opacity-100' : 'opacity-0'
        } ${isInteractingWithCanvas ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{
          touchAction: 'none',
        }}
      />
    </div>
  );
};
