/**
 * ParamUI.js - Parameter UI Generator Library
 * @version 2.0.0
 * @license MIT
 * 
 * A browser-side JavaScript library for automatic parameter UI generation.
 * Creates a navigable parameter editor from a ParameterTable and synchronizes
 * values with a nested Prm object.
 * 
 * @example Basic Usage
 * ```html
 * <script src="paramui.js"></script>
 * <script>
 *   const params = [
 *     ['speed', 'Speed', 50, [0, 100, 1]],           // Slider
 *     ['name', 'Player Name', 'Player1', []],        // Textbox
 *     ['enabled', 'Enabled', true, []],              // Checkbox
 *     ['mode', 'Mode', 'Easy', ['Easy','Normal']],   // Selector
 *     ['start', 'Start!', false, 'button'],          // Button
 *     ['Options/volume', 'Volume', 0.8, [0,1,0.1]]   // Nested path
 *   ];
 *   
 *   const ui = new ParamUI(params, {
 *     title: 'Game Settings',
 *     onChange: ({variable, value}) => console.log(variable, value)
 *   });
 *   
 *   // Polling loop for button detection
 *   setInterval(() => {
 *     ui.updatePrm();
 *     if (ui.Prm.start) console.log('Started!');
 *   }, 100);
 * </script>
 * ```
 * 
 * @example ParameterTable Format
 * Each row: [variablePath, label, initialValue, spec]
 * 
 * Widget Types (auto-detected):
 *   Slider:   number + [min, max, step]     e.g., ['x', 'X', 0.5, [0, 1, 0.1]]
 *   Checkbox: boolean + []                  e.g., ['flag', 'Flag', true, []]
 *   Button:   boolean + 'button'            e.g., ['run', 'Run', false, 'button']
 *   Selector: any + ['opt1', 'opt2', ...]   e.g., ['mode', 'Mode', 'A', ['A','B']]
 *   File:     string + '*.ext' or 'folder'  e.g., ['file', 'File', '', '*.txt']
 *   Textbox:  fallback for other cases
 * 
 * @example Nested Parameters
 * Variable paths with '/' create nested objects:
 *   ['Settings/Audio/volume', 'Volume', 0.8, [0,1,0.1]]
 *   // Access: ui.Prm.Settings.Audio.volume
 * 
 * @example API Methods
 *   ui.updatePrm()              - Sync UI state to Prm object (resets buttons)
 *   ui.getParam('path')         - Get value by variable path
 *   ui.setParam('path', value)  - Set value by variable path
 *   ui.navigateTo('/Group')     - Navigate to a tree group
 *   ui.togglePanel()            - Show/hide the UI panel
 *   ui.destroy()                - Remove UI and cleanup
 * 
 * @example Headless Mode (for testing)
 *   const ui = new ParamUI(params, { showUI: false });
 *   ui.setParam('speed', 75);
 *   console.log(ui.Prm.speed); // 75
 */

(function(factory) {
  const exp = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exp;
  } else {
    window.ParamUI = exp.ParamUI;
    window.createParamUI = exp.createParamUI;
  }
})(function() {
  'use strict';
  
  // Utility functions
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clone = v => Array.isArray(v) ? v.map(clone) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k,v])=>[k,clone(v)])) : v;
  const norm = p => { let s = String(p||''); if(!s.startsWith('/'))s='/'+s; return s.length>1?s.replace(/\/+$/,''):s||'/'; };
  const split = p => String(p||'').split('/').filter(Boolean);
  const setNest = (t,p,v) => { const ps=split(p); if(!ps.length)return; let c=t; for(let i=0;i<ps.length-1;i++){if(!isObj(c[ps[i]]))c[ps[i]]={};c=c[ps[i]];} c[ps[ps.length-1]]=v; };
  const getNest = (t,p) => { let c=t; for(const k of split(p)){if(!c||!(k in c))return; c=c[k];} return c; };
  const decimals = s => s>=1?0:(String(s).split('.')[1]||'').length;
  const round = (v,s) => s<=0?v:Number((Math.round(v/s)*s).toFixed(decimals(s)));
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  
  const widgetType = (val, spec) => {
    if (typeof val==='number' && Array.isArray(spec) && spec.length===3) return 'slider';
    if (typeof val==='boolean' && spec==='button') return 'button';
    if (typeof val==='boolean' && Array.isArray(spec) && !spec.length) return 'checkbox';
    if (typeof val==='string' && typeof spec==='string' && (spec==='file'||spec==='folder'||spec.startsWith('*.'))) return 'file';
    if (Array.isArray(spec) && spec.length) return 'selector';
    return 'textbox';
  };
  
  // DOM helper
  const el = (tag, attrs={}, children=[]) => {
    const e = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k==='class') e.className = v;
      else if (k==='style' && isObj(v)) Object.assign(e.style, v);
      else if (k==='html') e.innerHTML = v;
      else if (k==='text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    }
    for (const c of (Array.isArray(children)?children:[children])) {
      if (c) e.appendChild(typeof c==='string' ? document.createTextNode(c) : c);
    }
    return e;
  };

  // CSS (minified)
  const CSS = `
.pu-bar{position:fixed;top:0;left:0;right:0;height:52px;z-index:10001;display:flex;align-items:center;padding:0 12px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.1);gap:12px;font-family:-apple-system,system-ui,sans-serif}
.pu-btn{width:40px;height:40px;border:none;border-radius:8px;background:0 0;cursor:pointer;display:flex;align-items:center;justify-content:center}
.pu-btn:hover{background:#f0f0f0}.pu-btn.on{background:#e3f2fd}
.pu-btn svg{width:24px;height:24px;stroke:#333;stroke-width:2;stroke-linecap:round;fill:none}
.pu-title{font-size:16px;font-weight:700;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pu-over{display:none;position:fixed;top:52px;left:0;right:0;bottom:0;background:rgba(0,0,0,.3);z-index:9998}
.pu-over.on{display:block}
.pu-root{position:fixed;top:52px;left:0;height:calc(100vh - 52px);width:360px;max-width:90vw;display:flex;flex-direction:column;border-right:1px solid #d0d7de;overflow:hidden;font-family:-apple-system,system-ui,sans-serif;background:#fff;color:#222;box-sizing:border-box;z-index:9999;transform:translateX(0);transition:transform .25s;box-shadow:2px 0 12px rgba(0,0,0,.1)}
.pu-root.off{transform:translateX(-100%)}
.pu-nav{border-bottom:1px solid #d0d7de;background:#f6f8fa;flex-shrink:0;overflow:hidden;transition:max-height .25s}
.pu-nav.off{max-height:40px!important}
.pu-nav-h{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;user-select:none}
.pu-nav-h:hover{background:#eaeef2}
.pu-nav-l{font-size:12px;font-weight:600;color:#57606a;text-transform:uppercase;letter-spacing:.5px}
.pu-nav-t{width:20px;height:20px;display:flex;align-items:center;justify-content:center;transition:transform .2s}
.pu-nav.off .pu-nav-t{transform:rotate(-90deg)}
.pu-nav-t svg{width:14px;height:14px;stroke:#57606a;stroke-width:2;fill:none}
.pu-tree{overflow:auto;padding:4px 8px 10px;max-height:220px}
.pu-node{margin:1px 0}
.pu-node-r{display:flex;align-items:center;gap:2px}
.pu-exp{width:20px;height:20px;border:none;background:0 0;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:4px;flex-shrink:0;transition:transform .15s}
.pu-exp:hover{background:#ddd}
.pu-exp svg{width:12px;height:12px;stroke:#666;stroke-width:2;fill:none}
.pu-exp.off{transform:rotate(-90deg)}
.pu-exp.hide{visibility:hidden}
.pu-nbtn{flex:1;text-align:left;padding:6px 8px;border:0;border-radius:5px;background:0 0;cursor:pointer;font-size:13px;color:#333;transition:background .15s}
.pu-nbtn:hover{background:#e0e5ea}
.pu-nbtn.on{background:#dbeafe;font-weight:600;color:#1d4ed8}
.pu-child{margin-left:18px;overflow:hidden;transition:max-height .2s}
.pu-child.off{max-height:0!important}
.pu-path{padding:10px 14px;border-bottom:1px solid #d0d7de;font-size:12px;color:#57606a;background:#fff;flex-shrink:0}
.pu-cont{padding:14px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:14px}
.pu-row{display:flex;flex-direction:column;gap:6px}
.pu-row label{font-size:13px;font-weight:600;color:#333}
.pu-row input[type=text],.pu-row input[type=number],.pu-row select{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #c9d1d9;border-radius:6px;font-size:14px;background:#fff}
.pu-row input:focus,.pu-row select:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}
.pu-inline{display:flex;gap:10px;align-items:center}
.pu-inline input[type=range]{flex:1;height:6px;-webkit-appearance:none;background:#d1d5db;border-radius:3px;cursor:pointer}
.pu-inline input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;background:#2563eb;border-radius:50%;cursor:pointer}
.pu-inline input[type=number]{width:80px;flex-shrink:0}
.pu-gbtn{padding:10px 16px;border-radius:6px;border:1px solid #c9d1d9;background:#f6f8fa;cursor:pointer;font-size:14px;font-weight:500}
.pu-gbtn:hover{background:#eef2f6;border-color:#b0b8c1}
.pu-chk{display:flex;align-items:center;gap:10px}
.pu-chk input{width:18px;height:18px;cursor:pointer;accent-color:#2563eb}
.pu-chk span{font-size:13px;color:#666}
.pu-muted{color:#6b7280;font-size:11px;margin-top:4px}
.pu-hide{display:none!important}
@media(max-width:480px){.pu-bar{height:48px;padding:0 8px}.pu-root{top:48px;height:calc(100vh - 48px);width:100vw;max-width:100vw;border-right:none}.pu-btn{width:36px;height:36px}.pu-title{font-size:15px}.pu-cont{padding:12px}.pu-tree{max-height:180px}.pu-inline input[type=number]{width:70px}}
@media(max-height:500px)and(orientation:landscape){.pu-root{width:300px}.pu-tree{max-height:100px}.pu-cont{padding:10px;gap:10px}}`;
  
  const ICONS = {
    menu: '<svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
    right: '<svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"/></svg>'
  };

  class ParamUI {
    /**
     * Create a ParamUI instance
     * @param {Array} parameterTable - Array of [variablePath, label, initialValue, spec]
     * @param {Object} options - Configuration options
     * @param {string} options.title - UI title (default: 'ParamUI')
     * @param {boolean} options.showUI - Show UI (default: true, false for headless)
     * @param {Function} options.onChange - Callback on value change
     */
    constructor(parameterTable = [], options = {}) {
      this.title = options.title || 'ParamUI';
      this.showUI = options.showUI !== false;
      this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
      this.IsAlive = true;
      
      this.Prm = {};
      this.state = {};
      this.widgetDefs = [];
      this.widgetMap = {};
      this.groupedDefs = {'/': []};
      this.treePaths = ['/'];
      this.filePayloads = {};
      this.currentPath = '/';
      
      this._refs = {};
      this._treeRefs = {};
      this._treeExp = {};
      this._els = {};
      this._visible = true;
      this._navOff = false;
      
      this._build(parameterTable);
      if (this.showUI && typeof document !== 'undefined') this._createUI();
    }
    
    _build(table) {
      const paths = new Set(['/']);
      for (const row of (Array.isArray(table) ? table : [])) {
        if (!Array.isArray(row) || row.length < 4) continue;
        const [variable, label, init, spec] = row;
        const parts = split(variable);
        const group = parts.length > 1 ? '/' + parts.slice(0,-1).join('/') : '/';
        const wtype = widgetType(init, spec);
        
        setNest(this.Prm, variable, clone(init));
        this.state[variable] = clone(init);
        
        const def = { variable, label, init: clone(init), spec: clone(spec), wtype, group: norm(group) };
        this.widgetDefs.push(def);
        this.widgetMap[variable] = def;
        if (!this.groupedDefs[def.group]) this.groupedDefs[def.group] = [];
        this.groupedDefs[def.group].push(def);
        
        let cur = '/';
        paths.add('/');
        for (const p of parts.slice(0,-1)) {
          cur = cur === '/' ? `/${p}` : `${cur}/${p}`;
          paths.add(norm(cur));
          if (!this.groupedDefs[norm(cur)]) this.groupedDefs[norm(cur)] = [];
        }
      }
      this.treePaths = [...paths].sort((a,b) => {
        const da = a==='/'?0:a.split('/').length, db = b==='/'?0:b.split('/').length;
        return da !== db ? da - db : a.localeCompare(b);
      });
      for (const p of this.treePaths) this._treeExp[p] = true;
    }
    
    _injectCSS() {
      if (document.getElementById('pu-css')) return;
      const s = document.createElement('style');
      s.id = 'pu-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    
    _createUI() {
      this._injectCSS();
      
      // Header bar
      const bar = el('div', {class:'pu-bar'}, [
        el('button', {class:'pu-btn on', html:ICONS.menu, onClick:()=>this.togglePanel()}),
        el('span', {class:'pu-title', text:this.title})
      ]);
      this._els.bar = bar;
      this._els.toggle = bar.firstChild;
      
      // Overlay
      const over = el('div', {class:'pu-over', onClick:()=>this.hidePanel()});
      this._els.over = over;
      
      // Root panel
      const navH = el('div', {class:'pu-nav-h', onClick:()=>this._toggleNav()}, [
        el('span', {class:'pu-nav-l', text:'Navigation'}),
        el('span', {class:'pu-nav-t', html:ICONS.chev})
      ]);
      const tree = el('div', {class:'pu-tree'});
      const nav = el('div', {class:'pu-nav'}, [navH, tree]);
      const path = el('div', {class:'pu-path'});
      const cont = el('div', {class:'pu-cont'});
      const root = el('div', {class:'pu-root'}, [nav, path, cont]);
      
      Object.assign(this._els, {root, nav, tree, path, cont});
      document.body.append(bar, over, root);
      this._renderTree();
      this._renderContent();
    }
    
    _toggleNav() {
      this._navOff = !this._navOff;
      this._els.nav.classList.toggle('off', this._navOff);
      if (!this._navOff) this._updateNavH();
    }
    
    _updateNavH() {
      if (!this._els.nav) return;
      const h = this._els.tree.scrollHeight;
      this._els.nav.style.maxHeight = (40 + Math.min(h, 220)) + 'px';
    }
    
    _buildTreeData() {
      const root = {path:'/', name:'Root', children:[]};
      const map = {'/': root};
      for (const p of this.treePaths) {
        if (p === '/') continue;
        const parts = split(p);
        const parent = parts.length === 1 ? '/' : '/' + parts.slice(0,-1).join('/');
        const node = {path:p, name:parts[parts.length-1], children:[]};
        map[p] = node;
        if (map[parent]) map[parent].children.push(node);
      }
      return root;
    }
    
    _renderTree() {
      const tree = this._els.tree;
      tree.innerHTML = '';
      this._treeRefs = {};
      this._renderNode(this._buildTreeData(), tree);
      this._updateNavH();
    }
    
    _renderNode(node, parent) {
      const hasKids = node.children.length > 0;
      const exp = el('button', {
        class: 'pu-exp' + (hasKids ? (this._treeExp[node.path] ? '' : ' off') : ' hide'),
        html: ICONS.right,
        onClick: e => { e.stopPropagation(); this._toggleNode(node.path); }
      });
      const btn = el('button', {
        class: 'pu-nbtn' + (node.path === this.currentPath ? ' on' : ''),
        text: node.name,
        onClick: () => { if (this.currentPath !== node.path) { this.currentPath = node.path; this._syncTreeSel(); this._renderContent(); }}
      });
      const row = el('div', {class:'pu-node-r'}, [exp, btn]);
      const wrap = el('div', {class:'pu-node'}, [row]);
      
      if (hasKids) {
        const ch = el('div', {class: 'pu-child' + (this._treeExp[node.path] ? '' : ' off'), style:{maxHeight:'none'}});
        for (const c of node.children) this._renderNode(c, ch);
        wrap.appendChild(ch);
        this._treeRefs[node.path] = {exp, btn, ch};
      } else {
        this._treeRefs[node.path] = {exp, btn, ch:null};
      }
      parent.appendChild(wrap);
    }
    
    _toggleNode(p) {
      const on = this._treeExp[p];
      this._treeExp[p] = !on;
      const r = this._treeRefs[p];
      if (r) {
        r.exp.classList.toggle('off', on);
        if (r.ch) r.ch.classList.toggle('off', on);
      }
      this._updateNavH();
    }
    
    _syncTreeSel() {
      for (const [p, r] of Object.entries(this._treeRefs)) {
        r.btn.classList.toggle('on', p === this.currentPath);
      }
    }
    
    _renderContent() {
      const {path, cont} = this._els;
      path.textContent = 'Path: ' + this.currentPath;
      cont.innerHTML = '';
      this._refs = {};
      const defs = this.groupedDefs[this.currentPath] || [];
      if (!defs.length) {
        cont.appendChild(el('div', {class:'pu-muted', text:'No parameters in this group.'}));
        return;
      }
      for (const d of defs) cont.appendChild(this._widget(d));
    }
    
    _widget(d) {
      const v = d.variable, val = this.state[v], id = 'pu-' + v.replace(/\W+/g,'-');
      
      if (d.wtype === 'button') {
        const b = el('button', {class:'pu-gbtn', text:d.label, style:{width:'100%'}, onClick:()=>{
          this.state[v] = true;
          this._emit(v, true, d);
        }});
        this._refs[v] = {t:'button', b};
        return el('div', {class:'pu-row'}, [b]);
      }
      
      const lbl = el('label', {for:id, text:d.label});
      let ctrl;
      
      switch (d.wtype) {
        case 'textbox': {
          const inp = el('input', {type:'text', id, value:val??''});
          inp.oninput = () => { this.state[v] = inp.value; this._emit(v, inp.value, d); };
          this._refs[v] = {t:'text', inp};
          ctrl = inp;
          break;
        }
        case 'selector': {
          const sel = el('select', {id}, d.spec.map(o => el('option', {value:String(o), text:String(o)})));
          sel.value = String(val);
          sel.onchange = () => { this.state[v] = sel.value; this._emit(v, sel.value, d); };
          this._refs[v] = {t:'sel', sel};
          ctrl = sel;
          break;
        }
        case 'slider': {
          const [min, max, step] = d.spec, dec = decimals(step);
          const rng = el('input', {type:'range', id, min, max, step, value:val});
          const num = el('input', {type:'number', min, max, step, value:Number(val).toFixed(dec)});
          const sync = src => {
            let n = Number(src.value);
            if (isNaN(n)) n = d.init || 0;
            n = clamp(round(n, step), min, max);
            rng.value = n; num.value = n.toFixed(dec);
            this.state[v] = n;
            this._emit(v, n, d);
          };
          rng.oninput = () => sync(rng);
          num.onchange = () => sync(num);
          this._refs[v] = {t:'slider', rng, num, min, max, step, dec};
          ctrl = el('div', {class:'pu-inline'}, [rng, num]);
          break;
        }
        case 'checkbox': {
          const chk = el('input', {type:'checkbox', id});
          chk.checked = Boolean(val);
          const cap = el('span', {text:String(Boolean(val))});
          chk.onchange = () => {
            this.state[v] = chk.checked;
            cap.textContent = String(chk.checked);
            this._emit(v, chk.checked, d);
          };
          this._refs[v] = {t:'chk', chk, cap};
          ctrl = el('div', {class:'pu-chk'}, [chk, cap]);
          break;
        }
        case 'file': {
          const disp = el('input', {type:'text', id, readonly:'', value:val||'', placeholder:d.spec==='folder'?'No folder':'No file'});
          const btn = el('button', {class:'pu-gbtn', text:d.spec==='folder'?'Folder':'Browse'});
          const fin = el('input', {type:'file', class:'pu-hide'});
          if (typeof d.spec==='string' && d.spec.startsWith('*.')) fin.accept = d.spec.replace(/;/g,',').replace(/\*/g,'');
          if (d.spec==='folder') { fin.setAttribute('webkitdirectory',''); fin.multiple = true; }
          btn.onclick = () => fin.click();
          fin.onchange = () => {
            const files = [...(fin.files||[])];
            const txt = d.spec==='folder' 
              ? (files[0]?.webkitRelativePath||files[0]?.name||'').split('/')[0]
              : files.map(f=>f.name).join(', ');
            disp.value = txt;
            this.state[v] = txt;
            this.filePayloads[v] = files;
            this._emit(v, txt, d);
          };
          this._refs[v] = {t:'file', disp, fin};
          const note = el('div', {class:'pu-muted', text:'Browser limits path visibility.'});
          ctrl = el('div', {}, [el('div', {class:'pu-inline'}, [disp, btn]), fin, note]);
          break;
        }
      }
      return el('div', {class:'pu-row'}, [lbl, ctrl]);
    }
    
    _sync(d) {
      if (!d || d.group !== this.currentPath) return;
      const r = this._refs[d.variable];
      if (!r) return;
      const val = this.state[d.variable];
      switch (r.t) {
        case 'text': if (r.inp.value !== String(val??'')) r.inp.value = val??''; break;
        case 'sel': if (r.sel.value !== String(val??'')) r.sel.value = val??''; break;
        case 'slider': {
          let n = Number(val); if (isNaN(n)) n = d.init||0;
          n = clamp(round(n, r.step), r.min, r.max);
          r.rng.value = n; r.num.value = n.toFixed(r.dec);
          break;
        }
        case 'chk': r.chk.checked = Boolean(val); r.cap.textContent = String(Boolean(val)); break;
        case 'file': if (r.disp.value !== String(val||'')) r.disp.value = val||''; break;
      }
    }
    
    _emit(v, val, d) {
      if (!this.onChange) return;
      try { this.onChange({variable:v, value:val, definition:d, prm:this.Prm, instance:this}); } catch(e) { console.error('ParamUI onChange:', e); }
    }
    
    /** Sync UI state to Prm object. Resets button states after read. */
    updatePrm() {
      if (!this.IsAlive) return;
      for (const d of this.widgetDefs) {
        let val = this.state[d.variable];
        if (d.wtype === 'slider' && typeof val === 'number') {
          const [min, max, step] = d.spec;
          val = clamp(round(val, step), min, max);
          this.state[d.variable] = val;
        }
        setNest(this.Prm, d.variable, clone(val));
      }
      for (const d of this.widgetDefs) {
        if (d.wtype === 'button' && this.state[d.variable]) {
          this.state[d.variable] = false;
          this._sync(d);
        }
      }
    }
    
    /** Get parameter value by variable path */
    getParam(path) { return getNest(this.Prm, path); }
    
    /** Set parameter value by variable path */
    setParam(path, value) {
      const d = this.widgetMap[path];
      if (!d) return false;
      if (d.wtype === 'slider' && typeof value === 'number') {
        const [min, max, step] = d.spec;
        value = clamp(round(value, step), min, max);
      }
      this.state[path] = value;
      setNest(this.Prm, path, value);
      this._sync(d);
      this._emit(path, value, d);
      return true;
    }
    
    /** Alias for setParam */
    updateParameter(path, value) { return this.setParam(path, value); }
    
    /** Get selected files for file/folder widget */
    getFilePayload(path) { return this.filePayloads[path] || null; }
    
    /** Navigate to a tree group path */
    navigateTo(path) {
      const p = norm(path);
      if (!(p in this.groupedDefs)) return false;
      this.currentPath = p;
      if (this._els.tree) { this._syncTreeSel(); this._renderContent(); }
      return true;
    }
    
    /** Toggle panel visibility */
    togglePanel() { this._visible ? this.hidePanel() : this.showPanel(); }
    
    /** Show the panel */
    showPanel() {
      this._visible = true;
      if (this._els.root) this._els.root.classList.remove('off');
      if (this._els.toggle) this._els.toggle.classList.add('on');
      if (this._els.over && window.innerWidth <= 480) this._els.over.classList.add('on');
    }
    
    /** Hide the panel */
    hidePanel() {
      this._visible = false;
      if (this._els.root) this._els.root.classList.add('off');
      if (this._els.toggle) this._els.toggle.classList.remove('on');
      if (this._els.over) this._els.over.classList.remove('on');
    }
    
    /** Remove UI and cleanup */
    destroy() {
      this.IsAlive = false;
      for (const e of Object.values(this._els)) if (e?.parentNode) e.parentNode.removeChild(e);
      this._els = {};
      this._refs = {};
      this._treeRefs = {};
    }
    
    /** Alias for destroy */
    closeUI() { this.destroy(); }
  }

  /** Factory function to create ParamUI instance */
  function createParamUI(parameterTable, options) {
    return new ParamUI(parameterTable, options);
  }

  return { ParamUI, createParamUI };
});
