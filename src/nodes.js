/**
 * antwo workflow - Node (Card) Management Engine
 * Defines node metadata, UI creation, property serialization, and canvas dragging.
 */

export const NODE_METADATA = {
  text_input: {
    title: 'Constant Text',
    class: 'node-type-text_input',
    inputs: [],
    outputs: [{ name: 'output', label: 'Output', type: 'text' }],
    fields: [
      { name: 'value', label: 'Text Value', type: 'textarea', default: 'Hello World' }
    ]
  },
  concat: {
    title: 'Concatenate Text',
    class: 'node-type-concat',
    inputs: [
      { name: 'a', label: 'Text A', type: 'text' },
      { name: 'b', label: 'Text B', type: 'text' }
    ],
    outputs: [{ name: 'output', label: 'Result', type: 'text' }],
    fields: [
      { name: 'delimiter', label: 'Separator', type: 'input', default: ' ' }
    ]
  },
  file_reader: {
    title: 'Read File',
    class: 'node-type-file_reader',
    inputs: [],
    outputs: [{ name: 'content', label: 'Content', type: 'text' }],
    fields: [
      { name: 'filePath', label: 'Relative File Path', type: 'input', default: 'test.txt' }
    ]
  },
  file_writer: {
    title: 'Write File',
    class: 'node-type-file_writer',
    inputs: [
      { name: 'content', label: 'Content', type: 'text' }
    ],
    outputs: [{ name: 'success', label: 'Success', type: 'text' }],
    fields: [
      { name: 'filePath', label: 'Relative File Path', type: 'input', default: 'output.txt' }
    ]
  },
  command_exec: {
    title: 'Command Executor',
    class: 'node-type-command_exec',
    inputs: [],
    outputs: [
      { name: 'stdout', label: 'Stdout', type: 'text' },
      { name: 'stderr', label: 'Stderr', type: 'text' },
      { name: 'exitCode', label: 'Code', type: 'text' }
    ],
    fields: [
      { name: 'command', label: 'Terminal Command', type: 'textarea', default: 'echo "Executing command..."' }
    ]
  },
  ai_prompt: {
    title: 'Prompt Gemini',
    class: 'node-type-ai_prompt',
    inputs: [
      { name: 'prompt', label: 'Dynamic Prompt', type: 'text' }
    ],
    outputs: [{ name: 'response', label: 'Response', type: 'text' }], // type is dynamically validated
    fields: [
      { name: 'systemInstruction', label: 'System Instruction', type: 'textarea', default: 'You are a helpful coding assistant.' },
      { name: 'prompt', label: 'Static Prompt', type: 'textarea', default: 'Explain what code is.' },
      { name: 'outputType', label: 'Output Type', type: 'select', options: ['text', 'image'], default: 'text' }
    ]
  },
  combine: {
    title: 'Combine Inputs',
    class: 'node-type-combine',
    inputs: [], // managed dynamically inside the card constructor
    outputs: [
      { name: 'text', label: 'Text Output', type: 'text' },
      { name: 'image', label: 'Image Output', type: 'image' }
    ],
    fields: []
  },
  preview_text: {
    title: 'Preview Result',
    class: 'node-type-preview_text',
    inputs: [{ name: 'text', label: 'Text Input', type: 'text' }],
    outputs: [{ name: 'output', label: 'Output', type: 'text' }],
    fields: []
  },
  preview_image: {
    title: 'Preview Image',
    class: 'node-type-preview_image',
    inputs: [{ name: 'image', label: 'Image Path', type: 'image' }],
    outputs: [{ name: 'output', label: 'Output', type: 'image' }],
    fields: []
  }
};

export class NodeCard {
  constructor(id, type, x, y, graphCanvas, onMove, onDelete) {
    this.id = id || `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.graphCanvas = graphCanvas;
    this.onMove = onMove; // Callback when node drags
    this.onDelete = onDelete;

    this.metadata = NODE_METADATA[type];
    if (!this.metadata) {
      throw new Error(`Unknown node type: ${type}`);
    }

    // Node state fields
    this.fields = {};
    for (const f of this.metadata.fields || []) {
      this.fields[f.name] = f.default || '';
    }

    // Dynamic inputs support (specifically for combine node)
    this.customInputs = [];
    if (this.type === 'combine') {
      this.customInputs = [
        { name: 'text_0', label: 'Text Input 1', type: 'text' },
        { name: 'image_0', label: 'Image Input 1', type: 'image' }
      ];
    }

    this.domElement = null;
    this.selected = false;
    this.status = 'idle'; // idle, running, completed, error

    this.createDom();
  }

  /**
   * Render node card DOM structure
   */
  createDom() {
    const card = document.createElement('div');
    card.id = this.id;
    card.className = `node-card node-type-${this.type}`;
    card.style.left = `${this.x}px`;
    card.style.top = `${this.y}px`;

    // Header
    const header = document.createElement('div');
    header.className = 'node-header';
    
    const titleArea = document.createElement('div');
    titleArea.className = 'node-header-title';
    const statusLed = document.createElement('div');
    statusLed.className = 'node-status-dot';
    const title = document.createElement('span');
    title.textContent = this.metadata.title;
    titleArea.appendChild(statusLed);
    titleArea.appendChild(title);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'node-delete-btn';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Delete Node';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onDelete(this.id);
    });

    header.appendChild(titleArea);
    
    // Add small Play button for Gemini/Combine nodes in header
    if (this.type === 'ai_prompt' || this.type === 'combine') {
      const runBtn = document.createElement('button');
      runBtn.className = 'node-run-single-btn';
      runBtn.innerHTML = '&#9654;'; // ▶ symbol
      runBtn.title = 'Run This Node Only';
      runBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const event = new CustomEvent('node-run-single', {
          detail: { nodeId: this.id }
        });
        window.dispatchEvent(event);
      });
      header.appendChild(runBtn);
    }

    header.appendChild(deleteBtn);
    card.appendChild(header);

    // Body Fields
    const body = document.createElement('div');
    body.className = 'node-body';

    for (const f of this.metadata.fields || []) {
      const fieldGroup = document.createElement('div');
      fieldGroup.className = 'node-field-group';
      
      const label = document.createElement('label');
      label.textContent = f.label;
      fieldGroup.appendChild(label);

      let inputEl;
      if (f.type === 'textarea') {
        inputEl = document.createElement('textarea');
        inputEl.rows = 3;
      } else if (f.type === 'select') {
        inputEl = document.createElement('select');
        inputEl.className = 'node-select-input';
        for (const opt of f.options || []) {
          const optEl = document.createElement('option');
          optEl.value = opt;
          optEl.textContent = opt.toUpperCase();
          if (opt === this.fields[f.name]) {
            optEl.selected = true;
          }
          inputEl.appendChild(optEl);
        }
      } else {
        inputEl = document.createElement('input');
        inputEl.type = 'text';
      }
      
      inputEl.value = this.fields[f.name];
      inputEl.dataset.field = f.name;
      
      // Stop keyboard event propagation when focused so shortcut keys don't trigger
      inputEl.addEventListener('keydown', (e) => e.stopPropagation());
      
      if (f.type === 'select') {
        inputEl.addEventListener('change', (e) => {
          this.fields[f.name] = e.target.value;
          if (this.type === 'ai_prompt' && f.name === 'outputType') {
            const outDot = this.domElement.querySelector(`#port-out-${this.id}-response`);
            if (outDot) {
              outDot.dataset.porttype = e.target.value;
              
              // Dispatch custom event to let the main orchestrator clear incompatible connections
              const event = new CustomEvent('node-port-type-changed', {
                detail: { nodeId: this.id, portName: 'response', newType: e.target.value }
              });
              window.dispatchEvent(event);
            }
          }
        });
      } else {
        inputEl.addEventListener('input', (e) => {
          this.fields[f.name] = e.target.value;
        });
      }

      fieldGroup.appendChild(inputEl);
      body.appendChild(fieldGroup);
    }

    // Render dynamic visual preview panels
    if (this.type === 'preview_text') {
      const previewBox = document.createElement('pre');
      previewBox.className = 'node-preview-box text-preview-box';
      previewBox.id = `preview-text-${this.id}`;
      previewBox.textContent = '(Waiting for execution...)';
      body.appendChild(previewBox);
    } else if (this.type === 'preview_image') {
      const previewBox = document.createElement('div');
      previewBox.className = 'node-preview-box image-preview-box';
      
      const img = document.createElement('img');
      img.id = `preview-img-${this.id}`;
      img.className = 'preview-image-el';
      img.alt = 'Image Preview';
      img.style.display = 'none';
      
      const placeholder = document.createElement('div');
      placeholder.id = `preview-placeholder-${this.id}`;
      placeholder.className = 'preview-placeholder';
      placeholder.textContent = '(Waiting for image...)';
      
      previewBox.appendChild(img);
      previewBox.appendChild(placeholder);
      body.appendChild(previewBox);
    }

    // Ports Row
    const portsRow = document.createElement('div');
    portsRow.className = 'node-ports';

    // Inputs Column
    const inputsCol = document.createElement('div');
    inputsCol.className = 'ports-column inputs-column';
    const allInputs = [...(this.metadata.inputs || []), ...(this.customInputs || [])];
    for (const input of allInputs) {
      const portItem = this.createPortItem(input, 'in');
      inputsCol.appendChild(portItem);
    }

    // Outputs Column
    const outputsCol = document.createElement('div');
    outputsCol.className = 'ports-column outputs-column';
    for (const output of this.metadata.outputs || []) {
      const portItem = this.createPortItem(output, 'out');
      outputsCol.appendChild(portItem);
    }

    portsRow.appendChild(inputsCol);
    portsRow.appendChild(outputsCol);
    body.appendChild(portsRow);

    // If combine node, render the add buttons bar below the ports
    if (this.type === 'combine') {
      const addButtonsBar = document.createElement('div');
      addButtonsBar.className = 'combine-buttons-bar';
      
      const addTextBtn = document.createElement('button');
      addTextBtn.className = 'combine-add-btn';
      addTextBtn.textContent = '+ Text';
      addTextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.addCustomInput('text');
      });

      const addImageBtn = document.createElement('button');
      addImageBtn.className = 'combine-add-btn';
      addImageBtn.textContent = '+ Image';
      addImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.addCustomInput('image');
      });

      addButtonsBar.appendChild(addTextBtn);
      addButtonsBar.appendChild(addImageBtn);
      body.appendChild(addButtonsBar);
    }

    card.appendChild(body);

    // Create resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'node-resize-handle';
    card.appendChild(resizeHandle);
    this.setupResize(resizeHandle, card);

    // Click/Drag event listeners
    this.setupDrag(header, card);
    
    card.addEventListener('mousedown', () => {
      this.select();
    });

    this.domElement = card;
  }

  /**
   * Draggable logic that scales correctly with Canvas Zoom level
   */
  setupDrag(handle, card) {
    let startX = 0;
    let startY = 0;

    const onMouseMove = (e) => {
      // Adjust movement delta based on current zoom level
      const deltaX = (e.clientX - startX) / this.graphCanvas.scale;
      const deltaY = (e.clientY - startY) / this.graphCanvas.scale;

      this.x += deltaX;
      this.y += deltaY;

      card.style.left = `${this.x}px`;
      card.style.top = `${this.y}px`;

      startX = e.clientX;
      startY = e.clientY;

      if (this.onMove) {
        this.onMove(this.id);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left click only
      e.stopPropagation();
      e.preventDefault();

      startX = e.clientX;
      startY = e.clientY;

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  /**
   * Draggable resize logic that scales correctly with Canvas Zoom level
   */
  setupResize(handle, card) {
    let startWidth = 0;
    let startHeight = 0;
    let startX = 0;
    let startY = 0;

    const onMouseMove = (e) => {
      const deltaX = (e.clientX - startX) / this.graphCanvas.scale;
      const deltaY = (e.clientY - startY) / this.graphCanvas.scale;

      const newWidth = Math.max(180, startWidth + deltaX);
      const newHeight = Math.max(100, startHeight + deltaY);

      card.style.width = `${newWidth}px`;
      card.style.height = `${newHeight}px`;

      if (this.onMove) {
        this.onMove(this.id);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left click only
      e.stopPropagation();
      e.preventDefault();

      startWidth = card.offsetWidth;
      startHeight = card.offsetHeight;
      startX = e.clientX;
      startY = e.clientY;

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  /**
   * Set node status and update stylesheet decorations
   */
  setStatus(status) {
    this.status = status;
    this.domElement.classList.remove('node-running', 'node-completed', 'node-error');
    if (status === 'running') {
      this.domElement.classList.add('node-running');
      if (this.type === 'preview_text') {
        const el = document.getElementById(`preview-text-${this.id}`);
        if (el) el.textContent = '(Running workflow...)';
      }
    }
    if (status === 'completed') this.domElement.classList.add('node-completed');
    if (status === 'error') {
      this.domElement.classList.add('node-error');
      if (this.type === 'preview_text') {
        const el = document.getElementById(`preview-text-${this.id}`);
        if (el) el.textContent = '(Execution failed)';
      }
    }
  }

  /**
   * Update visual output preview boxes on execution completed
   */
  updatePreview(outputs) {
    this.lastOutputs = outputs;
    if (this.type === 'preview_text') {
      const el = document.getElementById(`preview-text-${this.id}`);
      if (el && outputs && outputs.value !== undefined) {
        el.textContent = outputs.value;
      }
    } 
    else if (this.type === 'preview_image') {
      const img = document.getElementById(`preview-img-${this.id}`);
      const placeholder = document.getElementById(`preview-placeholder-${this.id}`);
      
      if (img && placeholder && outputs && outputs.src) {
        let srcVal = outputs.src;
        
        // Parse source to check if it's absolute URL, base64 or workspace file path
        if (!srcVal.startsWith('http://') && !srcVal.startsWith('https://') && !srcVal.startsWith('data:')) {
          // Check if it's an absolute path (Windows drive letter or absolute slash)
          if (/^[a-zA-Z]:[\\/]/.test(srcVal) || srcVal.startsWith('/') || srcVal.startsWith('\\')) {
            srcVal = `http://localhost:3000/api/file?path=${encodeURIComponent(srcVal)}`;
          } else {
            // Relative workspace path, serve from local server
            srcVal = `http://localhost:3000/workspace/${srcVal}`;
          }
        }
        
        img.src = srcVal;
        img.style.display = 'block';
        placeholder.style.display = 'none';
      }
    }
  }

  /**
   * Select current card
   */
  select() {
    if (this.selected) return;
    
    // Broadcast select to let engine deselect others
    const deselectEvent = new CustomEvent('deselect-all', { detail: { except: this.id } });
    window.dispatchEvent(deselectEvent);

    this.selected = true;
    this.domElement.classList.add('selected');
  }

  /**
   * Deselect card
   */
  deselect() {
    this.selected = false;
    if (this.domElement) {
      this.domElement.classList.remove('selected');
    }
  }

  /**
   * Toggle visibility of fields when an input port receives/loses a connection
   */
  onInputConnected(portName, isConnected) {
    if (this.type === 'ai_prompt' && portName === 'prompt') {
      const promptEl = this.domElement.querySelector('[data-field="prompt"]');
      if (promptEl) {
        const fieldGroup = promptEl.closest('.node-field-group');
        if (fieldGroup) {
          fieldGroup.style.display = isConnected ? 'none' : 'flex';
          
          // Let DOM layout update, then trigger coordinate redraw
          if (this.onMove) {
            setTimeout(() => {
              this.onMove(this.id);
            }, 0);
          }
        }
      }
    }
  }

  /**
   * Helper to create a single port DOM element (input or output)
   */
  createPortItem(portSpec, direction) {
    const portItem = document.createElement('div');
    portItem.className = 'port-item';
    portItem.dataset.portName = portSpec.name;

    const dot = document.createElement('div');
    dot.className = `port-dot port-${direction === 'in' ? 'input' : 'output'}`;
    dot.id = `port-${direction}-${this.id}-${portSpec.name}`;
    dot.dataset.node = this.id;
    dot.dataset.port = portSpec.name;
    dot.dataset.direction = direction;
    
    let pType = portSpec.type || 'text';
    if (this.type === 'ai_prompt' && portSpec.name === 'response') {
      pType = this.fields.outputType || 'text';
    }
    dot.dataset.porttype = pType;

    const label = document.createElement('span');
    label.textContent = portSpec.label;

    if (direction === 'in') {
      portItem.appendChild(dot);
      portItem.appendChild(label);

      // Add a small delete button for dynamic custom inputs
      if (this.customInputs && this.customInputs.some(ci => ci.name === portSpec.name)) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'port-remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Remove Input';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeCustomInput(portSpec.name);
        });
        portItem.appendChild(removeBtn);
      }
    } else {
      portItem.appendChild(label);
      portItem.appendChild(dot);
    }

    return portItem;
  }

  /**
   * Add a dynamic input port (text or image) to a combine node
   */
  addCustomInput(type) {
    const textCount = this.customInputs.filter(ci => ci.type === 'text').length;
    const imageCount = this.customInputs.filter(ci => ci.type === 'image').length;

    const portName = `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const label = type === 'text' ? `Text Input ${textCount + 1}` : `Image Input ${imageCount + 1}`;

    const portSpec = { name: portName, label, type };
    this.customInputs.push(portSpec);

    const inputsCol = this.domElement.querySelector('.inputs-column');
    if (inputsCol) {
      const portItem = this.createPortItem(portSpec, 'in');
      inputsCol.appendChild(portItem);
    }

    // Force wire redraw
    if (this.onMove) {
      setTimeout(() => {
        this.onMove(this.id);
      }, 10);
    }
  }

  /**
   * Remove a dynamic input port
   */
  removeCustomInput(portName) {
    this.customInputs = this.customInputs.filter(ci => ci.name !== portName);

    const inputsCol = this.domElement.querySelector('.inputs-column');
    if (inputsCol) {
      const item = inputsCol.querySelector(`[data-port-name="${portName}"]`);
      if (item) item.remove();
    }

    // Dispatch custom event to notify main program to cleanup connected wires
    const event = new CustomEvent('custom-port-removed', {
      detail: { nodeId: this.id, portName, direction: 'in' }
    });
    window.dispatchEvent(event);

    // Force wire redraw
    if (this.onMove) {
      setTimeout(() => {
        this.onMove(this.id);
      }, 10);
    }
  }

  /**
   * Return serialization JSON of this node
   */
  serialize() {
    const data = {
      id: this.id,
      type: this.type,
      x: Math.round(this.x),
      y: Math.round(this.y),
      fields: { ...this.fields }
    };
    if (this.domElement) {
      data.width = this.domElement.offsetWidth;
      data.height = this.domElement.offsetHeight;
    }
    if (this.type === 'combine') {
      data.customInputs = this.customInputs;
    }
    if (this.lastOutputs) {
      data.outputs = this.lastOutputs;
    }
    return data;
  }

  /**
   * Get Port center relative to parent `#canvas-grid` container for drawing lines
   */
  getPortCenter(portName, direction) {
    const portId = `port-${direction}-${this.id}-${portName}`;
    const dot = document.getElementById(portId);
    if (!dot) return { x: this.x, y: this.y };

    // Find the relative offset of the port dot inside the canvas grid
    const dotRect = dot.getBoundingClientRect();
    const canvasRect = document.getElementById('canvas-grid').getBoundingClientRect();

    // Map screen bounds to canvas coordinate grid accounting for scale
    const x = (dotRect.left + dotRect.width / 2 - canvasRect.left) / this.graphCanvas.scale;
    const y = (dotRect.top + dotRect.height / 2 - canvasRect.top) / this.graphCanvas.scale;

    return { x, y };
  }
}
