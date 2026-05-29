/**
 * antwo workflow - Main Orchestrator & Client Glue
 * Coordinates UI events, WebSocket pipelines, loading/saving APIs, and state updates.
 */

import { GraphCanvas } from './canvas.js';
import { NodeCard } from './nodes.js';
import { EdgeManager } from './edges.js';

// DOM References
const btnRun = document.getElementById('btn-run');
const btnSave = document.getElementById('btn-save');
const btnLoadTrigger = document.getElementById('btn-load-trigger');
const loadDropdownMenu = document.getElementById('load-dropdown-menu');
const btnClear = document.getElementById('btn-clear');
const btnClearLogs = document.getElementById('btn-clear-logs');
const logsPanel = document.getElementById('logs-panel');
const backendLed = document.getElementById('backend-status');
const backendText = document.getElementById('backend-status-text');
const btnSettings = document.getElementById('btn-settings');

// Modals
const saveModal = document.getElementById('save-modal');
const btnSaveConfirm = document.getElementById('btn-save-confirm');
const btnSaveCancel = document.getElementById('btn-save-cancel');
const workflowNameInput = document.getElementById('workflow-name-input');

const settingsModal = document.getElementById('settings-modal');
const btnSettingsSave = document.getElementById('btn-settings-save');
const btnSettingsCancel = document.getElementById('btn-settings-cancel');
const settingsCliPath = document.getElementById('settings-cli-path');

// Toolbox search
const nodeSearch = document.getElementById('node-search');

// State lists
let nodesList = [];
let ws = null;
let appSettings = {}; // Holds dynamic path for agy.exe CLI
const BACKEND_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

// Canvas navigation and wires
const canvas = new GraphCanvas('canvas-container', 'canvas-grid');
const edges = new EdgeManager('connections-svg', 'canvas-container', canvas);

// Bind connection toggles to dynamically show/hide node card fields
edges.onConnectionChange = (nodeId, portName, isConnected) => {
  const node = nodesList.find(n => n.id === nodeId);
  if (node) {
    node.onInputConnected(portName, isConnected);
  }
};

// Reset canvas triggers
document.getElementById('canvas-zoom-in').addEventListener('click', () => {
  canvas.scale = Math.min(canvas.maxScale, canvas.scale + 0.15);
  canvas.updateTransform();
});
document.getElementById('canvas-zoom-out').addEventListener('click', () => {
  canvas.scale = Math.max(canvas.minScale, canvas.scale - 0.15);
  canvas.updateTransform();
});
document.getElementById('canvas-reset').addEventListener('click', () => canvas.reset());

// Close logs panel or custom events
canvas.onCanvasClick(() => {
  deselectAllNodes();
});

// Deselect-all event listener from cards
window.addEventListener('deselect-all', (e) => {
  const exceptId = e.detail.except;
  for (const node of nodesList) {
    if (node.id !== exceptId) {
      node.deselect();
    }
  }
});

// Listener for edge removed
window.addEventListener('connection-removed', (e) => {
  const { fromNode, fromPort, toNode, toPort } = e.detail;
  log(`Disconnected edge: ${fromNode}.${fromPort} → ${toNode}.${toPort}`, 'system');
});

// Listener for datatype mismatches
window.addEventListener('connection-failed', (e) => {
  log(`Connection blocked: ${e.detail.reason}`, 'error');
});

// Listener for dynamic outputType select dropdown changes in nodes
window.addEventListener('node-port-type-changed', (e) => {
  const { nodeId, portName, newType } = e.detail;
  // Find all outgoing connections from this port
  const badConns = edges.connections.filter(c => 
    c.fromNode === nodeId && 
    c.fromPort === portName
  );
  
  for (const conn of badConns) {
    const toPortDot = document.getElementById(`port-in-${conn.toNode}-${conn.toPort}`);
    if (toPortDot) {
      const expectedType = toPortDot.dataset.porttype || 'text';
      if (expectedType !== newType) {
        edges.removeConnection(conn.id);
        log(`Removed incompatible connection due to datatype mismatch: ${conn.fromNode}.${conn.fromPort} (now ${newType.toUpperCase()}) ↛ ${conn.toNode}.${conn.toPort}`, 'system');
      }
    }
  }
});

// Listener for dynamic inputs removal on combine node
window.addEventListener('custom-port-removed', (e) => {
  const { nodeId, portName, direction } = e.detail;
  const badConn = edges.connections.find(c => 
    (direction === 'in' && c.toNode === nodeId && c.toPort === portName) ||
    (direction === 'out' && c.fromNode === nodeId && c.fromPort === portName)
  );
  if (badConn) {
    edges.removeConnection(badConn.id);
    log(`Removed connected wire on dynamic port deletion: ${badConn.fromNode}.${badConn.fromPort} → ${badConn.toNode}.${badConn.toPort}`, 'system');
  }
});

/**
 * Deselect all node cards on the screen
 */
function deselectAllNodes() {
  for (const node of nodesList) {
    node.deselect();
  }
}

function log(message, type = 'system') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}-log collapsed`;
  
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  
  // Click to toggle collapse/expand state
  entry.addEventListener('click', () => {
    entry.classList.toggle('collapsed');
  });
  
  logsPanel.appendChild(entry);
  logsPanel.scrollTop = logsPanel.scrollHeight;
}

btnClearLogs.addEventListener('click', () => {
  logsPanel.innerHTML = '';
});

/**
 * Initialize Web Socket to local server
 */
function connectWebSocket() {
  log('Connecting to antwo workflow execution backend...', 'system');
  backendLed.className = 'status-led offline';
  backendText.textContent = 'Connecting...';

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    backendLed.className = 'status-led online';
    backendText.textContent = 'Connected';
    log('Successfully connected to execution engine.', 'success');
  };

  ws.onclose = () => {
    backendLed.className = 'status-led offline';
    backendText.textContent = 'Disconnected';
    log('Disconnected from execution engine. Retrying in 5 seconds...', 'error');
    
    // Reset Run button state
    resetRunButton();
    
    setTimeout(connectWebSocket, 5000);
  };

  ws.onerror = () => {
    backendLed.className = 'status-led offline';
    backendText.textContent = 'Error';
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'system':
          log(msg.message, 'system');
          if (msg.message.includes('complete')) {
            resetRunButton();
            edges.resetAllWireAnimations();
          }
          break;

        case 'error':
          log(msg.message, 'error');
          resetRunButton();
          edges.resetAllWireAnimations();
          break;

        case 'node_status': {
          const { nodeId, status, data } = msg;
          const node = nodesList.find(n => n.id === nodeId);
          if (node) {
            node.setStatus(status);
            
            if (status === 'running') {
              log(`Node [${node.metadata.title}] is active...`, 'running');
              edges.setWireRunning(nodeId, true);

              // Generalized downstream loading state for Gemini/Command nodes (recursive)
              if (node.type === 'ai_prompt' || node.type === 'combine' || node.type === 'command_exec') {
                const visited = new Set();
                const dfsDescendants = (currId) => {
                  const outConns = edges.connections.filter(c => c.fromNode === currId);
                  for (const conn of outConns) {
                    if (!visited.has(conn.toNode)) {
                      visited.add(conn.toNode);
                      const dsNode = nodesList.find(n => n.id === conn.toNode);
                      if (dsNode && dsNode.domElement) {
                        dsNode.domElement.classList.add('node-downstream-loading');
                        if (dsNode.type === 'preview_text') {
                          const el = document.getElementById(`preview-text-${dsNode.id}`);
                          if (el) {
                            const isCmd = node.type === 'command_exec';
                            el.textContent = isCmd ? '(Waiting for command output...)' : '(Waiting for Gemini response...)';
                          }
                        }
                      }
                      dfsDescendants(conn.toNode);
                    }
                  }
                };
                dfsDescendants(nodeId);
              }
            } 
            else if (status === 'completed') {
              const outputSummary = JSON.stringify(data.outputs);
              log(`Node [${node.metadata.title}] completed successfully. Outputs: ${outputSummary}`, 'success');
              edges.setWireRunning(nodeId, false);
              
              // Render visual output previews
              node.updatePreview(data.outputs);

              // Generalized downstream loading cleanup on completion (recursive)
              if (node.type === 'ai_prompt' || node.type === 'combine' || node.type === 'command_exec') {
                const visited = new Set();
                const dfsCleanup = (currId) => {
                  const outConns = edges.connections.filter(c => c.fromNode === currId);
                  for (const conn of outConns) {
                    if (!visited.has(conn.toNode)) {
                      visited.add(conn.toNode);
                      const dsNode = nodesList.find(n => n.id === conn.toNode);
                      if (dsNode && dsNode.domElement) {
                        dsNode.domElement.classList.remove('node-downstream-loading');
                      }
                      dfsCleanup(conn.toNode);
                    }
                  }
                };
                dfsCleanup(nodeId);
              }
            } 
            else if (status === 'error') {
              log(`Node [${node.metadata.title}] failed: ${data.error}`, 'error');
              edges.setWireRunning(nodeId, false);

              // Generalized downstream loading cleanup on error (recursive)
              if (node.type === 'ai_prompt' || node.type === 'combine' || node.type === 'command_exec') {
                const visited = new Set();
                const dfsCleanup = (currId) => {
                  const outConns = edges.connections.filter(c => c.fromNode === currId);
                  for (const conn of outConns) {
                    if (!visited.has(conn.toNode)) {
                      visited.add(conn.toNode);
                      const dsNode = nodesList.find(n => n.id === conn.toNode);
                      if (dsNode && dsNode.domElement) {
                        dsNode.domElement.classList.remove('node-downstream-loading');
                        if (dsNode.type === 'preview_text') {
                          const el = document.getElementById(`preview-text-${dsNode.id}`);
                          if (el) el.textContent = '(Parent execution failed)';
                        }
                      }
                      dfsCleanup(conn.toNode);
                    }
                  }
                };
                dfsCleanup(nodeId);
              }
            }
            else if (status === 'tracing') {
              log(data.message, 'info');
            }
          }
          break;
        }
      }
    } catch (err) {
      log(`WebSocket Message Error: ${err.message}`, 'error');
    }
  };
}

// Initial connection
connectWebSocket();

/**
 * Handle adding new nodes to canvas
 */
function addNode(type, clientX, clientY) {
  // Convert screen center coords to scaled canvas coordinates
  let canvasCoords;
  if (clientX !== undefined && clientY !== undefined) {
    canvasCoords = canvas.screenToCanvas(clientX, clientY);
  } else {
    // Default to center of canvas container
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();
    canvasCoords = canvas.screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // Offset slightly to avoid exact stacking
  const count = nodesList.filter(n => n.type === type).length;
  const x = canvasCoords.x - 125 + (count * 15);
  const y = canvasCoords.y - 75 + (count * 15);

  const nodeCard = new NodeCard(
    null,
    type,
    x,
    y,
    canvas,
    // onMove
    (nodeId) => {
      edges.redrawNodeConnections(nodeId);
    },
    // onDelete
    (nodeId) => {
      deleteNode(nodeId);
    }
  );

  document.getElementById('nodes-layer').appendChild(nodeCard.domElement);
  nodesList.push(nodeCard);
  nodeCard.select();

  log(`Created node: ${nodeCard.metadata.title}`, 'system');
}

/**
 * Delete node and clean connections
 */
function deleteNode(nodeId) {
  const index = nodesList.findIndex(n => n.id === nodeId);
  if (index === -1) return;

  const node = nodesList[index];
  node.domElement.remove();
  nodesList.splice(index, 1);

  // Clear wire lines
  edges.clearNodeConnections(nodeId);
  log(`Removed node: ${node.metadata.title}`, 'system');
}

/**
 * Set up Toolbox click triggers to add cards
 */
document.querySelectorAll('.add-node-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const type = btn.dataset.type;
    addNode(type);
  });
});

/**
 * Search Nodes Library
 */
nodeSearch.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  document.querySelectorAll('.add-node-btn').forEach(btn => {
    const text = btn.textContent.toLowerCase();
    if (text.includes(query)) {
      btn.style.display = 'flex';
    } else {
      btn.style.display = 'none';
    }
  });
});

/**
 * Run Graph execution
 */
btnRun.addEventListener('click', () => {
  if (nodesList.length === 0) {
    log('Canvas is empty. Add nodes to execute a workflow.', 'error');
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    log('Server offline. Cannot run workflow.', 'error');
    return;
  }

  // Reset status indicators
  for (const node of nodesList) {
    node.setStatus('idle');
    if (node.domElement) {
      node.domElement.classList.remove('node-downstream-loading');
    }
  }
  edges.resetAllWireAnimations();

  // Disable Run button
  btnRun.disabled = true;
  btnRun.innerHTML = `
    <svg class="btn-icon animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-dasharray="32" />
    </svg>
    Running...
  `;

  // Serialize the graph
  const graph = {
    nodes: nodesList.map(n => n.serialize()),
    connections: edges.serialize()
  };

  ws.send(JSON.stringify({
    type: 'run',
    graph
  }));
});

function resetRunButton() {
  btnRun.disabled = false;
  btnRun.innerHTML = `
    <svg class="btn-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
    Run Workflow
  `;
}

/**
 * Clear Workspace Canvas
 */
btnClear.addEventListener('click', () => {
  if (confirm('Are you sure you want to clear the canvas? All unsaved work will be lost.')) {
    // Remove node DOMs
    for (const node of nodesList) {
      node.domElement.remove();
    }
    nodesList = [];
    
    // Clear connections
    edges.clearAll();
    
    log('Canvas cleared.', 'system');
  }
});

/**
 * Save Workflow Modal Actions
 */
btnSave.addEventListener('click', () => {
  if (nodesList.length === 0) {
    alert('No nodes on canvas to save.');
    return;
  }
  saveModal.classList.add('show');
  workflowNameInput.focus();
});

btnSaveCancel.addEventListener('click', () => {
  saveModal.classList.remove('show');
});

btnSaveConfirm.addEventListener('click', async () => {
  const name = workflowNameInput.value.trim();
  if (!name) {
    alert('Workflow name is required');
    return;
  }

  const graph = {
    nodes: nodesList.map(n => n.serialize()),
    connections: edges.serialize()
  };

  try {
    const res = await fetch(`${BACKEND_URL}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, graph })
    });
    const result = await res.json();
    if (result.success) {
      log(`Workflow saved successfully as "${result.filename}.json"`, 'success');
      saveModal.classList.remove('show');
      workflowNameInput.value = '';
    } else {
      alert(`Save failed: ${result.error}`);
    }
  } catch (err) {
    alert(`Server error: ${err.message}`);
  }
});

/**
 * Load Workflows dropdown triggers
 */
btnLoadTrigger.addEventListener('click', async (e) => {
  e.stopPropagation();
  loadDropdownMenu.classList.toggle('show');
  
  if (loadDropdownMenu.classList.contains('show')) {
    await refreshWorkflowList();
  }
});

// Close dropdown on click outside
window.addEventListener('click', () => {
  loadDropdownMenu.classList.remove('show');
});

async function refreshWorkflowList() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/workflows`);
    const data = await res.json();
    
    if (data.success && data.workflows.length > 0) {
      loadDropdownMenu.innerHTML = '';
      for (const w of data.workflows) {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = w;
        item.addEventListener('click', () => loadWorkflow(w));
        loadDropdownMenu.appendChild(item);
      }
    } else {
      loadDropdownMenu.innerHTML = '<div class="dropdown-item empty-state">No saved workflows</div>';
    }
  } catch (err) {
    loadDropdownMenu.innerHTML = '<div class="dropdown-item empty-state">Failed to fetch list</div>';
  }
}

/**
 * Load saved graph into Workspace
 */
async function loadWorkflow(name) {
  log(`Loading workflow: "${name}"...`, 'system');
  
  try {
    const res = await fetch(`${BACKEND_URL}/api/workflows/${name}`);
    const data = await res.json();

    if (!data.success) {
      log(`Failed to load workflow: ${data.error}`, 'error');
      return;
    }

    // 1. Clear current canvas
    for (const node of nodesList) {
      node.domElement.remove();
    }
    nodesList = [];
    edges.clearAll();

    // 2. Re-create nodes
    const savedNodes = data.graph.nodes || [];
    for (const sNode of savedNodes) {
      const nodeCard = new NodeCard(
        sNode.id,
        sNode.type,
        sNode.x,
        sNode.y,
        canvas,
        (nodeId) => edges.redrawNodeConnections(nodeId),
        (nodeId) => deleteNode(nodeId)
      );

      // Re-populate values
      if (sNode.fields) {
        for (const [fName, fVal] of Object.entries(sNode.fields)) {
          nodeCard.fields[fName] = fVal;
          // Sync text input element in DOM
          const el = nodeCard.domElement.querySelector(`[data-field="${fName}"]`);
          if (el) el.value = fVal;
        }
      }

      // Re-populate customInputs if combine node
      if (sNode.type === 'combine' && sNode.customInputs) {
        nodeCard.customInputs = sNode.customInputs;
        // Re-create the inputs inside the DOM inputsCol
        const inputsCol = nodeCard.domElement.querySelector('.inputs-column');
        if (inputsCol) {
          inputsCol.innerHTML = '';
          for (const ci of sNode.customInputs) {
            const portItem = nodeCard.createPortItem(ci, 'in');
            inputsCol.appendChild(portItem);
          }
        }
      }

      // Restore custom size if saved
      if (sNode.width && sNode.height) {
        nodeCard.domElement.style.width = `${sNode.width}px`;
        nodeCard.domElement.style.height = `${sNode.height}px`;
      }

      document.getElementById('nodes-layer').appendChild(nodeCard.domElement);
      nodesList.push(nodeCard);
    }

    // 3. Re-create connections
    const savedConns = data.graph.connections || [];
    // Timeout buffer to ensure all DOM elements are mounted before mapping wires
    setTimeout(() => {
      for (const sc of savedConns) {
        try {
          edges.createConnection(sc.fromNode, sc.fromPort, sc.toNode, sc.toPort);
        } catch (err) {
          console.error('Failed to create edge in workflow reload:', err);
        }
      }
      log(`Workflow "${name}" loaded completely.`, 'success');
    }, 100);

  } catch (err) {
    log(`Load error: ${err.message}`, 'error');
  }
}

/**
 * Settings Management
 */
async function loadAppSettings() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/settings`);
    const data = await res.json();
    if (data.success) {
      appSettings = data.settings;
      console.log('Loaded Antigravity CLI Settings:', appSettings);
    }
  } catch (err) {
    console.error('Failed to load application settings:', err);
  }
}

// Fetch settings on initialization
loadAppSettings();

// Settings Button Interactions
btnSettings.addEventListener('click', () => {
  settingsCliPath.value = appSettings.cliPath || '';
  settingsModal.classList.add('show');
});

btnSettingsCancel.addEventListener('click', () => {
  settingsModal.classList.remove('show');
});

btnSettingsSave.addEventListener('click', async () => {
  const cliPath = settingsCliPath.value.trim();
  try {
    const res = await fetch(`${BACKEND_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliPath })
    });
    const data = await res.json();
    if (data.success) {
      appSettings = data.settings;
      log(`Settings saved. Antigravity CLI path set to: ${appSettings.cliPath}`, 'success');
      settingsModal.classList.remove('show');
    } else {
      alert(`Failed to save settings: ${data.error}`);
    }
  } catch (err) {
    alert(`Server error: ${err.message}`);
  }
});

// Single Node Execution Orchestrator
window.addEventListener('node-run-single', (e) => {
  const { nodeId } = e.detail;
  runSingleNode(nodeId);
});

function runSingleNode(nodeId) {
  const node = nodesList.find(n => n.id === nodeId);
  if (!node) return;

  node.setStatus('running');

  // Serialize the graph incorporating cached inputs and outputs
  const graph = {
    nodes: nodesList.map(n => n.serialize()),
    connections: edges.serialize()
  };

  ws.send(JSON.stringify({
    type: 'run_single',
    nodeId,
    graph
  }));
}
