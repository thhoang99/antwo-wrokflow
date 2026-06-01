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
      { name: 'value', label: 'Text Value', type: 'textarea', default: '' }
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
    outputs: [{ name: 'content', label: 'Content', type: 'disabled' }],
    fields: [
      { name: 'filePath', label: 'Relative File Path', type: 'input', default: '' }
    ]
  },
  file_writer: {
    title: 'Write File',
    class: 'node-type-file_writer',
    inputs: [
      { name: 'content', label: 'Content', type: 'text' }
    ],
    outputs: [],
    fields: [
      { name: 'filePath', label: 'Relative File Path', type: 'input', default: '' }
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
      { name: 'command', label: 'Terminal Command', type: 'textarea', default: '' }
    ]
  },
  ai_prompt: {
    title: 'Prompt Gemini',
    class: 'node-type-ai_prompt',
    inputs: [
      { name: 'prompt', label: 'Prompt', type: 'text' }
    ],
    outputs: [{ name: 'response', label: 'Response', type: 'text' }], // type is dynamically validated
    fields: [
      { name: 'systemInstruction', label: 'System Instruction', type: 'textarea', default: '' },
      { name: 'prompt', label: 'Prompt', type: 'textarea', default: '' },
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
  loop: {
    title: 'Loop Action',
    class: 'node-type-loop',
    inputs: [
      { name: 'input', label: 'Input', type: 'any' }
    ],
    outputs: [
      { name: 'output', label: 'Output', type: 'any' }
    ],
    fields: [
      { name: 'iterations', label: 'Iterations (Times)', type: 'input', default: '3' }
    ]
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

    if (this.type === 'text_input') {
      this.lastOutputs = { output: this.fields.value || '' };
    }

    // Initialize Advanced Option fields for Gemini-using nodes
    if (this.type === 'ai_prompt' || this.type === 'combine') {
      const defW = (window.appSettings && window.appSettings.defaultImageWidth) || 512;
      const defH = (window.appSettings && window.appSettings.defaultImageHeight) || 512;
      this.fields.imageWidth = defW;
      this.fields.imageHeight = defH;
      this.fields.modelText = '';
      this.fields.modelImage = '';
      if (this.type === 'ai_prompt') {
        this.fields.systemInstruction = '';
      }
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

    // Add small Play button for Gemini/Combine/Loop nodes in header
    if (this.type === 'ai_prompt' || this.type === 'combine' || this.type === 'loop') {
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
      if (this.type === 'ai_prompt' && f.name === 'systemInstruction') {
        continue;
      }
      const fieldGroup = document.createElement('div');
      fieldGroup.className = 'node-field-group';

      const label = document.createElement('label');
      label.textContent = f.label;

      if (this.type === 'ai_prompt' && f.name === 'prompt') {
        fieldGroup.classList.add('field-with-port');
        
        const labelWrapper = document.createElement('div');
        labelWrapper.className = 'label-port-wrapper';
        labelWrapper.style.display = 'flex';
        labelWrapper.style.alignItems = 'center';
        labelWrapper.style.gap = '8px';
        labelWrapper.style.position = 'relative';

        const portSpec = { name: 'prompt', label: '', type: 'text' };
        const portItem = this.createPortItem(portSpec, 'in');
        
        portItem.style.width = '18px';
        portItem.style.height = '18px';
        portItem.style.padding = '0';
        portItem.style.margin = '0';
        portItem.style.display = 'inline-flex';
        portItem.style.alignItems = 'center';
        portItem.style.position = 'relative';
        
        const dot = portItem.querySelector('.port-dot');
        if (dot) {
          dot.style.position = 'relative';
          dot.style.top = '0';
          dot.style.left = '0';
          dot.style.margin = '0';
        }

        labelWrapper.appendChild(portItem);
        labelWrapper.appendChild(label);
        fieldGroup.appendChild(labelWrapper);
      } else {
        fieldGroup.appendChild(label);
      }

      let inputEl;
      if (this.type === 'file_reader' && f.name === 'filePath') {
        const wrapper = document.createElement('div');
        wrapper.className = 'file-picker-wrapper';
        wrapper.style.display = 'flex';
        wrapper.style.gap = '8px';
        wrapper.style.alignItems = 'center';

        inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.placeholder = 'No file selected';
        inputEl.readOnly = true;
        inputEl.style.display = 'none'; // Completely hidden!
        inputEl.value = this.fields[f.name];
        inputEl.dataset.field = f.name;

        const browseBtn = document.createElement('button');
        browseBtn.className = 'node-browse-btn';
        browseBtn.textContent = 'Browse File...';
        browseBtn.style.padding = '6px 12px';
        browseBtn.style.cursor = 'pointer';
        browseBtn.style.width = '100%';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.style.display = 'none';

        wrapper.appendChild(inputEl);
        wrapper.appendChild(browseBtn);
        wrapper.appendChild(fileInput);
        fieldGroup.appendChild(wrapper);

        // Preview container
        const previewContainer = document.createElement('div');
        previewContainer.className = 'node-file-preview-container';
        previewContainer.style.marginTop = '8px';
        previewContainer.style.width = '100%';
        previewContainer.style.display = 'none';
        fieldGroup.appendChild(previewContainer);

        const updateReaderPreview = (fileName, fileType, dataUrlOrSrc) => {
          previewContainer.innerHTML = '';
          previewContainer.style.display = 'block';

          const isImage = fileType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName);
          if (isImage) {
            const imgFrame = document.createElement('div');
            imgFrame.className = 'file-image-frame';
            imgFrame.style.border = '1px solid var(--border-color, #444)';
            imgFrame.style.borderRadius = '4px';
            imgFrame.style.padding = '4px';
            imgFrame.style.display = 'flex';
            imgFrame.style.justifyCenter = 'center';
            imgFrame.style.alignItems = 'center';
            imgFrame.style.background = '#222';
            imgFrame.style.maxHeight = '150px';
            imgFrame.style.overflow = 'hidden';

            const imgEl = document.createElement('img');
            imgEl.src = dataUrlOrSrc;
            imgEl.style.maxWidth = '100%';
            imgEl.style.maxHeight = '140px';
            imgEl.style.objectFit = 'contain';
            imgFrame.appendChild(imgEl);
            previewContainer.appendChild(imgFrame);
          } else {
            const textFrame = document.createElement('div');
            textFrame.className = 'file-text-frame';
            textFrame.style.border = '1px solid var(--border-color, #444)';
            textFrame.style.borderRadius = '4px';
            textFrame.style.padding = '8px';
            textFrame.style.background = '#222';
            textFrame.style.color = '#fff';
            textFrame.style.fontSize = '12px';
            textFrame.style.display = 'flex';
            textFrame.style.alignItems = 'center';
            textFrame.style.gap = '8px';

            const icon = document.createElement('span');
            icon.textContent = '📄';
            icon.style.fontSize = '16px';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = fileName;
            nameSpan.style.whiteSpace = 'nowrap';
            nameSpan.style.overflow = 'hidden';
            nameSpan.style.textOverflow = 'ellipsis';

            textFrame.appendChild(icon);
            textFrame.appendChild(nameSpan);
            previewContainer.appendChild(textFrame);
          }

          // Dynamically change port type!
          const outDot = this.domElement.querySelector(`#port-out-${this.id}-content`);
          if (outDot) {
            const newType = isImage ? 'image' : 'text';
            outDot.dataset.porttype = newType;
            outDot.classList.remove('port-disabled');
            outDot.style.opacity = '1';
            outDot.style.cursor = 'pointer';

            const event = new CustomEvent('node-port-type-changed', {
              detail: { nodeId: this.id, portName: 'content', newType }
            });
            window.dispatchEvent(event);
          }

          if (this.onMove) {
            setTimeout(() => this.onMove(this.id), 50);
          }
        };

        browseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          inputEl.value = file.name;
          this.fields[f.name] = file.name;

          const reader = new FileReader();
          reader.onload = async (evt) => {
            const dataUrl = evt.target.result;
            const base64Data = dataUrl.split(',')[1];

            try {
              const res = await fetch(`http://localhost:3000/api/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, base64Data })
              });
              const data = await res.json();
              if (data.success) {
                console.log('File uploaded to workspace:', file.name);
              }
            } catch (err) {
              console.error('File upload failed:', err);
            }

            updateReaderPreview(file.name, file.type, dataUrl);
          };
          reader.readAsDataURL(file);
        });

        // Initialize preview if filePath already has a value
        const initialVal = this.fields[f.name];
        if (initialVal && initialVal !== 'test.txt') {
          inputEl.value = initialVal;
          let srcUrl = `http://localhost:3000/workspace/${initialVal}`;
          updateReaderPreview(initialVal, '', srcUrl);
        }
      } else if (this.type === 'file_writer' && f.name === 'filePath') {
        const wrapper = document.createElement('div');
        wrapper.className = 'file-picker-wrapper';
        wrapper.style.display = 'flex';
        wrapper.style.gap = '8px';
        wrapper.style.alignItems = 'center';

        inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.placeholder = 'Enter output filename';
        inputEl.style.display = 'none'; // Completely hidden!
        inputEl.value = this.fields[f.name];
        inputEl.dataset.field = f.name;

        const browseBtn = document.createElement('button');
        browseBtn.className = 'node-browse-btn';
        browseBtn.textContent = 'Browse Save File...';
        browseBtn.style.padding = '6px 12px';
        browseBtn.style.cursor = 'pointer';
        browseBtn.style.width = '100%';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.style.display = 'none';

        wrapper.appendChild(inputEl);
        wrapper.appendChild(browseBtn);
        wrapper.appendChild(fileInput);
        fieldGroup.appendChild(wrapper);

        browseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          inputEl.value = file.name;
          this.fields[f.name] = file.name;
        });

        inputEl.addEventListener('keydown', (e) => e.stopPropagation());
        inputEl.addEventListener('input', (e) => {
          this.fields[f.name] = e.target.value;
        });
      } else {
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

        inputEl.addEventListener('keydown', (e) => e.stopPropagation());

        if (f.type === 'select') {
          inputEl.addEventListener('change', (e) => {
            this.fields[f.name] = e.target.value;
            if (this.type === 'ai_prompt' && f.name === 'outputType') {
              const outDot = this.domElement.querySelector(`#port-out-${this.id}-response`);
              if (outDot) {
                outDot.dataset.porttype = e.target.value;
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
            if (this.type === 'text_input' && f.name === 'value') {
              this.lastOutputs = { output: e.target.value };
            }
          });
        }

        fieldGroup.appendChild(inputEl);
      }

      body.appendChild(fieldGroup);
    }

    // Render Advanced Options collapsible dropdown for Gemini-using nodes
    if (this.type === 'ai_prompt' || this.type === 'combine') {
      const advancedGroup = document.createElement('div');
      advancedGroup.className = 'node-advanced-group';

      const advancedHeader = document.createElement('div');
      advancedHeader.className = 'node-advanced-header';
      advancedHeader.innerHTML = `
        <span class="advanced-toggle-icon">▶</span>
        <span class="advanced-toggle-title">Advanced Options</span>
      `;

      const advancedContent = document.createElement('div');
      advancedContent.className = 'node-advanced-content collapsed';

      advancedHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        const collapsed = advancedContent.classList.toggle('collapsed');
        advancedHeader.querySelector('.advanced-toggle-icon').textContent = collapsed ? '▶' : '▼';

        // Auto-stretch card height to perfectly fit advanced options
        const card = this.domElement;
        card.style.height = 'auto';
        const naturalHeight = card.offsetHeight;

        if (collapsed) {
          card.style.height = `${naturalHeight}px`;
        } else {
          card.style.height = `${Math.min(380, naturalHeight)}px`;
        }

        // Redraw connections because height changed
        if (this.onMove) {
          setTimeout(() => this.onMove(this.id), 0);
        }
      });

      // Add image size fields (width and height custom numbers, max 2048)
      const sizeRow = document.createElement('div');
      sizeRow.className = 'advanced-field-row';
      sizeRow.style.display = 'flex';
      sizeRow.style.gap = '8px';
      sizeRow.style.marginTop = '8px';

      const wGroup = document.createElement('div');
      wGroup.className = 'node-field-group';
      wGroup.style.flex = '1';
      const wLabel = document.createElement('label');
      wLabel.textContent = 'Image Width';
      const wInput = document.createElement('input');
      wInput.type = 'number';
      wInput.min = '1';
      wInput.max = '2048';
      wInput.dataset.field = 'imageWidth';
      const defW = (window.appSettings && window.appSettings.defaultImageWidth) || 512;
      if (this.fields.imageWidth === undefined) this.fields.imageWidth = defW;
      wInput.value = this.fields.imageWidth;
      wInput.addEventListener('keydown', (e) => e.stopPropagation());
      wInput.addEventListener('input', (e) => {
        this.fields.imageWidth = Math.min(2048, Math.max(1, parseInt(e.target.value) || 512));
      });
      wGroup.appendChild(wLabel);
      wGroup.appendChild(wInput);

      const hGroup = document.createElement('div');
      hGroup.className = 'node-field-group';
      hGroup.style.flex = '1';
      const hLabel = document.createElement('label');
      hLabel.textContent = 'Image Height';
      const hInput = document.createElement('input');
      hInput.type = 'number';
      hInput.min = '1';
      hInput.max = '2048';
      hInput.dataset.field = 'imageHeight';
      const defH = (window.appSettings && window.appSettings.defaultImageHeight) || 512;
      if (this.fields.imageHeight === undefined) this.fields.imageHeight = defH;
      hInput.value = this.fields.imageHeight;
      hInput.addEventListener('keydown', (e) => e.stopPropagation());
      hInput.addEventListener('input', (e) => {
        this.fields.imageHeight = Math.min(2048, Math.max(1, parseInt(e.target.value) || 512));
      });
      hGroup.appendChild(hLabel);
      hGroup.appendChild(hInput);

      sizeRow.appendChild(wGroup);
      sizeRow.appendChild(hGroup);
      advancedContent.appendChild(sizeRow);

      // Add Model Text dropdown
      const modelTextGroup = document.createElement('div');
      modelTextGroup.className = 'node-field-group';
      modelTextGroup.style.marginTop = '8px';
      const modelTextLabel = document.createElement('label');
      modelTextLabel.textContent = 'Text Model';
      const modelTextSelect = document.createElement('select');
      modelTextSelect.className = 'node-select-input';
      modelTextSelect.dataset.field = 'modelText';

      const emptyTextOpt = document.createElement('option');
      emptyTextOpt.value = '';
      emptyTextOpt.textContent = '-- Default Model --';
      modelTextSelect.appendChild(emptyTextOpt);
      if (this.fields.modelText === undefined) this.fields.modelText = '';
      modelTextSelect.value = this.fields.modelText;
      modelTextSelect.addEventListener('change', (e) => {
        this.fields.modelText = e.target.value;
      });
      modelTextGroup.appendChild(modelTextLabel);
      modelTextGroup.appendChild(modelTextSelect);
      advancedContent.appendChild(modelTextGroup);

      // Add Model Image dropdown
      const modelImageGroup = document.createElement('div');
      modelImageGroup.className = 'node-field-group';
      modelImageGroup.style.marginTop = '8px';
      const modelImageLabel = document.createElement('label');
      modelImageLabel.textContent = 'Image Model';
      const modelImageSelect = document.createElement('select');
      modelImageSelect.className = 'node-select-input';
      modelImageSelect.dataset.field = 'modelImage';

      const emptyImageOpt = document.createElement('option');
      emptyImageOpt.value = '';
      emptyImageOpt.textContent = '-- Default Model --';
      modelImageSelect.appendChild(emptyImageOpt);
      if (this.fields.modelImage === undefined) this.fields.modelImage = '';
      modelImageSelect.value = this.fields.modelImage;
      modelImageSelect.addEventListener('change', (e) => {
        this.fields.modelImage = e.target.value;
      });
      modelImageGroup.appendChild(modelImageLabel);
      modelImageGroup.appendChild(modelImageSelect);
      advancedContent.appendChild(modelImageGroup);

      // Add System Instruction textarea if type is ai_prompt
      if (this.type === 'ai_prompt') {
        const sysGroup = document.createElement('div');
        sysGroup.className = 'node-field-group';
        sysGroup.style.marginTop = '8px';
        const sysLabel = document.createElement('label');
        sysLabel.textContent = 'System Instruction';
        const sysText = document.createElement('textarea');
        sysText.rows = 3;
        sysText.dataset.field = 'systemInstruction';
        sysText.value = this.fields.systemInstruction || '';
        sysText.addEventListener('keydown', (e) => e.stopPropagation());
        sysText.addEventListener('input', (e) => {
          this.fields.systemInstruction = e.target.value;
        });
        sysGroup.appendChild(sysLabel);
        sysGroup.appendChild(sysText);
        advancedContent.appendChild(sysGroup);
      }

      advancedGroup.appendChild(advancedHeader);
      advancedGroup.appendChild(advancedContent);
      body.appendChild(advancedGroup);
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
      if (this.type === 'ai_prompt' && input.name === 'prompt') {
        continue;
      }
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
        promptEl.style.display = isConnected ? 'none' : 'block';

        // Let DOM layout update, then trigger coordinate redraw
        if (this.onMove) {
          setTimeout(() => {
            this.onMove(this.id);
          }, 0);
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
    if (this.type === 'file_reader' && portSpec.name === 'content') {
      const currentFile = this.fields.filePath;
      if (currentFile && currentFile !== 'test.txt') {
        pType = /\.(png|jpe?g|gif|webp|svg)$/i.test(currentFile) ? 'image' : 'text';
      } else {
        pType = 'disabled';
        dot.classList.add('port-disabled');
        dot.style.opacity = '0.3';
        dot.style.cursor = 'not-allowed';
      }
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

  setFieldValue(name, value) {
    this.fields[name] = value;
    const el = this.domElement.querySelector(`[data-field="${name}"]`);
    if (el) {
      el.value = value;
    }

    if (this.type === 'text_input' && name === 'value') {
      this.lastOutputs = { output: value };
    }

    if (this.type === 'file_reader' && name === 'filePath') {
      const previewContainer = this.domElement.querySelector('.node-file-preview-container');
      if (previewContainer) {
        if (!value || value === 'test.txt') {
          previewContainer.innerHTML = '';
          previewContainer.style.display = 'none';
          return;
        }
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'block';
        const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(value);
        if (isImage) {
          const imgFrame = document.createElement('div');
          imgFrame.className = 'file-image-frame';
          imgFrame.style.border = '1px solid var(--border-color, #444)';
          imgFrame.style.borderRadius = '4px';
          imgFrame.style.padding = '4px';
          imgFrame.style.display = 'flex';
          imgFrame.style.justifyContent = 'center';
          imgFrame.style.alignItems = 'center';
          imgFrame.style.background = '#222';
          imgFrame.style.maxHeight = '150px';
          imgFrame.style.overflow = 'hidden';

          const imgEl = document.createElement('img');
          imgEl.src = `http://localhost:3000/workspace/${value}`;
          imgEl.style.maxWidth = '100%';
          imgEl.style.maxHeight = '140px';
          imgEl.style.objectFit = 'contain';
          imgFrame.appendChild(imgEl);
          previewContainer.appendChild(imgFrame);
        } else {
          const textFrame = document.createElement('div');
          textFrame.className = 'file-text-frame';
          textFrame.style.border = '1px solid var(--border-color, #444)';
          textFrame.style.borderRadius = '4px';
          textFrame.style.padding = '8px';
          textFrame.style.background = '#222';
          textFrame.style.color = '#fff';
          textFrame.style.fontSize = '12px';
          textFrame.style.display = 'flex';
          textFrame.style.alignItems = 'center';
          textFrame.style.gap = '8px';

          const icon = document.createElement('span');
          icon.textContent = '📄';
          icon.style.fontSize = '16px';

          const nameSpan = document.createElement('span');
          nameSpan.textContent = value;
          nameSpan.style.whiteSpace = 'nowrap';
          nameSpan.style.overflow = 'hidden';
          nameSpan.style.textOverflow = 'ellipsis';

          textFrame.appendChild(icon);
          textFrame.appendChild(nameSpan);
          previewContainer.appendChild(textFrame);
        }

        // Enable and update port type dynamically!
        const outDot = this.domElement.querySelector(`#port-out-${this.id}-content`);
        if (outDot) {
          const newType = isImage ? 'image' : 'text';
          outDot.dataset.porttype = newType;
          outDot.classList.remove('port-disabled');
          outDot.style.opacity = '1';
          outDot.style.cursor = 'pointer';

          const event = new CustomEvent('node-port-type-changed', {
            detail: { nodeId: this.id, portName: 'content', newType }
          });
          window.dispatchEvent(event);
        }

        if (this.onMove) {
          setTimeout(() => this.onMove(this.id), 50);
        }
      }
    }
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
