// Floating toolbar injected into the page via a Shadow DOM host so the meeting
// app's CSS can't touch it and ours can't leak out. Pure vanilla TS.
import type { ToolKind } from '../shared/types';
import type { InputMode } from '../input/InputRouter';

export interface ToolbarController {
  setTool(tool: ToolKind): void;
  setColor(color: string): void;
  setWidth(width: number): void;
  undo(): void;
  clearAll(): void;
  toggleInput(): InputMode;
  toggleDraw(): boolean;
}

const TOOLS: Array<{ id: ToolKind; label: string; title: string }> = [
  { id: 'pen', label: '✏️', title: 'Pen' },
  { id: 'highlighter', label: '🖍️', title: 'Highlighter' },
  { id: 'laser', label: '🔴', title: 'Laser (fades)' },
  { id: 'arrow', label: '↗', title: 'Arrow' },
  { id: 'rect', label: '▭', title: 'Rectangle' },
  { id: 'ellipse', label: '◯', title: 'Ellipse' },
  { id: 'line', label: '／', title: 'Line' },
  { id: 'eraser', label: '🧽', title: 'Eraser' },
];

const COLORS = ['#ff3b30', '#34c759', '#0a84ff', '#ffd60a', '#ffffff', '#1c1c1e'];
const WIDTHS: Array<{ label: string; value: number }> = [
  { label: 'S', value: 3 },
  { label: 'M', value: 6 },
  { label: 'L', value: 12 },
];

const STYLE = `
:host { all: initial; }
.bar {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px; border-radius: 14px;
  background: rgba(20,20,22,0.92); box-shadow: 0 6px 24px rgba(0,0,0,0.4);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  z-index: 2147483647; user-select: none; backdrop-filter: blur(8px);
}
.grp { display: flex; align-items: center; gap: 4px; }
.sep { width: 1px; height: 22px; background: rgba(255,255,255,0.15); margin: 0 4px; }
button {
  all: unset; box-sizing: border-box; cursor: pointer;
  width: 30px; height: 30px; border-radius: 8px; text-align: center; line-height: 30px;
  font-size: 15px; color: #fff; background: transparent; transition: background .12s;
}
button:hover { background: rgba(255,255,255,0.12); }
button.active { background: rgba(255,255,255,0.22); outline: 1px solid rgba(255,255,255,0.35); }
.sw { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.sw.active { border-color: #fff; }
.w { font-weight: 600; font-size: 13px; }
.toggle { padding: 0 10px; width: auto; font-size: 13px; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: #8e8e93; margin-left: 2px; }
.dot.on { background: #34c759; }
.brand { color: #fff; font-weight: 700; font-size: 12px; opacity: .8; padding: 0 4px; letter-spacing: .3px; }
`;

export class Toolbar {
  private host: HTMLElement;
  private root: ShadowRoot;
  private dot!: HTMLElement;
  private drawBtn!: HTMLButtonElement;
  private inputBtn!: HTMLButtonElement;
  private toolBtns = new Map<ToolKind, HTMLButtonElement>();
  private colorBtns = new Map<string, HTMLElement>();
  private widthBtns = new Map<number, HTMLButtonElement>();

  constructor(private readonly ctrl: ToolbarController) {
    this.host = document.createElement('div');
    this.host.id = 'scribble-toolbar-host';
    this.host.style.position = 'fixed';
    this.host.style.zIndex = '2147483647';
    this.root = this.host.attachShadow({ mode: 'open' });
    this.build();
  }

  mount(): void {
    if (!this.host.isConnected) (document.body || document.documentElement).appendChild(this.host);
  }

  private build(): void {
    const style = document.createElement('style');
    style.textContent = STYLE;
    const bar = document.createElement('div');
    bar.className = 'bar';

    const brand = document.createElement('span');
    brand.className = 'brand';
    brand.textContent = 'Scribble';
    bar.appendChild(brand);
    bar.appendChild(this.sep());

    const toolGrp = document.createElement('div');
    toolGrp.className = 'grp';
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.textContent = t.label;
      b.title = t.title;
      if (t.id === 'pen') b.classList.add('active');
      b.addEventListener('click', () => this.onTool(t.id));
      this.toolBtns.set(t.id, b);
      toolGrp.appendChild(b);
    }
    bar.appendChild(toolGrp);
    bar.appendChild(this.sep());

    const colorGrp = document.createElement('div');
    colorGrp.className = 'grp';
    for (const c of COLORS) {
      const s = document.createElement('div');
      s.className = 'sw';
      s.style.background = c;
      s.title = c;
      if (c === '#ff3b30') s.classList.add('active');
      s.addEventListener('click', () => this.onColor(c));
      this.colorBtns.set(c, s);
      colorGrp.appendChild(s);
    }
    bar.appendChild(colorGrp);
    bar.appendChild(this.sep());

    const widthGrp = document.createElement('div');
    widthGrp.className = 'grp';
    for (const w of WIDTHS) {
      const b = document.createElement('button');
      b.className = 'w';
      b.textContent = w.label;
      b.title = `Width ${w.label}`;
      if (w.value === 6) b.classList.add('active');
      b.addEventListener('click', () => this.onWidth(w.value));
      this.widthBtns.set(w.value, b);
      widthGrp.appendChild(b);
    }
    bar.appendChild(widthGrp);
    bar.appendChild(this.sep());

    const undo = document.createElement('button');
    undo.textContent = '↶';
    undo.title = 'Undo';
    undo.addEventListener('click', () => this.ctrl.undo());
    bar.appendChild(undo);

    const clear = document.createElement('button');
    clear.textContent = '🗑';
    clear.title = 'Clear all';
    clear.addEventListener('click', () => this.ctrl.clearAll());
    bar.appendChild(clear);
    bar.appendChild(this.sep());

    this.inputBtn = document.createElement('button');
    this.inputBtn.className = 'toggle';
    this.inputBtn.textContent = '✋ Finger';
    this.inputBtn.title = 'Switch finger / mouse';
    this.inputBtn.addEventListener('click', () => {
      const mode = this.ctrl.toggleInput();
      this.inputBtn.textContent = mode === 'finger' ? '✋ Finger' : '🖱 Mouse';
    });
    bar.appendChild(this.inputBtn);

    this.dot = document.createElement('div');
    this.dot.className = 'dot';
    this.dot.title = 'Hand tracking';
    bar.appendChild(this.dot);
    bar.appendChild(this.sep());

    this.drawBtn = document.createElement('button');
    this.drawBtn.className = 'toggle';
    this.drawBtn.textContent = '● Draw';
    this.drawBtn.title = 'Toggle draw mode (Ctrl+Shift+D)';
    this.drawBtn.addEventListener('click', () => {
      const on = this.ctrl.toggleDraw();
      this.setDrawActive(on);
    });
    bar.appendChild(this.drawBtn);

    this.root.appendChild(style);
    this.root.appendChild(bar);
  }

  private sep(): HTMLElement {
    const s = document.createElement('div');
    s.className = 'sep';
    return s;
  }

  private onTool(tool: ToolKind): void {
    this.ctrl.setTool(tool);
    for (const [id, b] of this.toolBtns) b.classList.toggle('active', id === tool);
  }

  private onColor(color: string): void {
    this.ctrl.setColor(color);
    for (const [c, s] of this.colorBtns) s.classList.toggle('active', c === color);
  }

  private onWidth(width: number): void {
    this.ctrl.setWidth(width);
    for (const [w, b] of this.widthBtns) b.classList.toggle('active', w === width);
  }

  setDrawActive(active: boolean): void {
    this.drawBtn.classList.toggle('active', active);
    this.drawBtn.textContent = active ? '● Drawing' : '● Draw';
  }

  setFingerPresent(present: boolean): void {
    this.dot.classList.toggle('on', present);
  }
}
