# ParamUIjs

![Demo Image](https://covao.github.io/ParamUIjs/demo.png)

## Overview

ParamUIjs is a lightweight JavaScript library that automatically generates a parameter editor UI from a simple table definition.

## Quick Start

https://covao.github.io/ParamUIjs/paramui_demo.html

## Features

- Auto-generates UI from ParameterTable definition
- Supports slider, checkbox, button, selector, textbox, and file picker widgets
- Nested parameter structure with tree navigation
- Collapsible navigation tree with hierarchical folding
- Toggle panel visibility with hamburger menu
- Macro support for automation (set, wait, press commands)
- Mobile-responsive layout
- Headless mode for testing
- onChange callback for reactive applications
- No dependencies, single file

## Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)

## Installation

Download `paramui.js` and include it in your HTML:

```html
<script src="paramui.js"></script>
```

## Usage

Define parameters as a table and create a ParamUI instance:

```javascript
const params = [
  ['speed', 'Speed', 50, [0, 100, 1]],           // Slider: [min, max, step]
  ['name', 'Player Name', 'Player1', []],        // Textbox
  ['enabled', 'Enabled', true, []],              // Checkbox
  ['mode', 'Mode', 'Easy', ['Easy', 'Normal']],  // Selector
  ['start', 'Start!', false, 'button'],          // Button
  ['Options/volume', 'Volume', 0.8, [0, 1, 0.1]] // Nested path
];

const ui = new ParamUI(params, {
  title: 'Settings',
  onChange: ({ variable, value }) => console.log(variable, value)
});

// Polling loop for button detection
setInterval(() => {
  ui.updatePrm();
  if (ui.Prm.start) console.log('Started!');
}, 100);
```

### Parameter Table Format

Each row: `[variablePath, label, initialValue, spec]`

| Widget | initialValue | spec | Example |
|--------|-------------|------|---------|
| Slider | number | [min, max, step] | `['x', 'X', 0.5, [0, 1, 0.1]]` |
| Checkbox | boolean | [] | `['flag', 'Flag', true, []]` |
| Button | boolean | 'button' | `['run', 'Run', false, 'button']` |
| Selector | any | ['opt1', 'opt2'] | `['mode', 'Mode', 'A', ['A', 'B']]` |
| File | string | '*.ext' or 'folder' | `['file', 'File', '', '*.txt']` |
| Textbox | string | [] | `['name', 'Name', 'test', []]` |

### API

| Method | Description |
|--------|-------------|
| `updatePrm()` | Sync UI state to Prm object, reset buttons |
| `getParam(path)` | Get value by variable path |
| `setParam(path, value)` | Set value by variable path |
| `press(buttonPath)` | Press a button |
| `runMacro(macro)` | Run macro commands (async) |
| `navigateTo(path)` | Navigate to a tree group |
| `togglePanel()` | Toggle panel visibility |
| `destroy()` | Remove UI and cleanup |

### Macro

Automate parameter operations with macro commands:

```javascript
// Macro format: commands separated by ';'
// Use '.' for path hierarchy, enclose strings in single quotes
await ui.runMacro("A1=0.8; Options.Flag1=true; name='Hello'; wait 0.5; press Run;");
```

| Command | Format | Example |
|---------|--------|---------|
| set | `path=value` | `A1=0.8`, `Options.Flag1=true`, `name='Hello'` |
| wait | `wait seconds` | `wait 0.5` |
| press | `press buttonPath` | `press Run`, `press Options.Submit` |

### Nested Parameters

Use `/` in variable paths to create nested objects:

```javascript
['Settings/Audio/volume', 'Volume', 0.8, [0, 1, 0.1]]
// Access: ui.Prm.Settings.Audio.volume
```

## License

MIT
