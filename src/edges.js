/**
 * antwo workflow - Bezier Edge Connection Engine
 * Calculates visual S-curves, handles drag-to-connect interactions, and draws SVG wires.
 */

export class EdgeManager {
  constructor(svgId, canvasContainerId, graphCanvas) {
    this.svg = document.getElementById(svgId);
    this.container = document.getElementById(canvasContainerId);
    this.graphCanvas = graphCanvas;
    
    this.connections = []; // Array of { id, fromNode, fromPort, toNode, toPort, pathEl }
    
    // Connection draft state
    this.draftPath = null;
    this.activeDragPort = null; // { nodeId, portName, direction, dotEl }
    this.onConnectionChange = null; // Callback for UI connectivity toggles
    
    this.initEvents();
  }

  /**
   * Listen for drag-to-connect events from port dots
   */
  initEvents() {
    this.container.addEventListener('mousedown', (e) => {
      const portDot = e.target.closest('.port-dot');
      if (!portDot) return;
      
      e.stopPropagation();
      e.preventDefault();

      const dataset = portDot.dataset;
      this.activeDragPort = {
        nodeId: dataset.node,
        portName: dataset.port,
        direction: dataset.direction,
        dotEl: portDot
      };

      // Set active port highlight
      portDot.classList.add('port-active-connect');

      // Create draft line
      this.draftPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.draftPath.setAttribute('class', 'connection-draft');
      this.svg.appendChild(this.draftPath);

      // Highlight compatible ports
      this.togglePortHighlights(true, dataset.direction);

      // Drag mouse listeners
      const onMouseMove = (moveEvent) => {
        if (!this.activeDragPort) return;
        
        // Get start position in canvas coordinates
        const startPos = this.getPortCoords(this.activeDragPort);
        
        // Get current mouse position in canvas coordinates
        const mousePos = this.graphCanvas.screenToCanvas(moveEvent.clientX, moveEvent.clientY);
        
        // Calculate Bezier curve
        const pathData = this.calculateBezier(
          startPos.x, startPos.y,
          mousePos.x, mousePos.y,
          this.activeDragPort.direction
        );
        this.draftPath.setAttribute('d', pathData);
      };

      const onMouseUp = (upEvent) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        // Find if released over a target port
        let targetDot = upEvent.target.closest('.port-dot');
        
        // Generous proximity detection fallback (25px radius tolerance)
        if (!targetDot && this.activeDragPort) {
          const dots = document.querySelectorAll('.port-dot');
          let closestDot = null;
          let minDistance = 25; // radius in screen pixels
          
          for (const dot of dots) {
            const rect = dot.getBoundingClientRect();
            const dotX = rect.left + rect.width / 2;
            const dotY = rect.top + rect.height / 2;
            const dist = Math.hypot(upEvent.clientX - dotX, upEvent.clientY - dotY);
            if (dist < minDistance) {
              minDistance = dist;
              closestDot = dot;
            }
          }
          if (closestDot) {
            targetDot = closestDot;
          }
        }
        
        if (targetDot && this.activeDragPort) {
          const targetDataset = targetDot.dataset;
          const targetDir = targetDataset.direction;
          
          // Verify connection is valid (In to Out or Out to In, different nodes)
          if (targetDir !== this.activeDragPort.direction && targetDataset.node !== this.activeDragPort.nodeId) {
            const activeType = this.activeDragPort.dotEl.dataset.porttype || 'text';
            const targetType = targetDot.dataset.porttype || 'text';

            if (activeType !== targetType) {
              const event = new CustomEvent('connection-failed', {
                detail: { reason: `Cannot connect ${activeType.toUpperCase()} output to ${targetType.toUpperCase()} input` }
              });
              window.dispatchEvent(event);
            } else {
              let fromNode, fromPort, toNode, toPort;
              
              if (this.activeDragPort.direction === 'out') {
                fromNode = this.activeDragPort.nodeId;
                fromPort = this.activeDragPort.portName;
                toNode = targetDataset.node;
                toPort = targetDataset.port;
              } else {
                fromNode = targetDataset.node;
                fromPort = targetDataset.port;
                toNode = this.activeDragPort.nodeId;
                toPort = this.activeDragPort.portName;
              }

              this.createConnection(fromNode, fromPort, toNode, toPort);
            }
          }
        }

        // Clean up draft
        if (this.draftPath) {
          this.draftPath.remove();
          this.draftPath = null;
        }
        if (this.activeDragPort) {
          this.activeDragPort.dotEl.classList.remove('port-active-connect');
          this.activeDragPort = null;
        }

        this.togglePortHighlights(false);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  /**
   * Calculate exact Bezier curve points for S-curves
   */
  calculateBezier(x1, y1, x2, y2, startDirection) {
    // Control point horizontal offset (makes a nice aesthetic curve)
    const dist = Math.abs(x2 - x1);
    const cpOffset = Math.max(50, dist * 0.45);
    
    // If output is dragging, curve outwards to the right first
    const cp1x = startDirection === 'out' ? x1 + cpOffset : x1 - cpOffset;
    const cp1y = y1;
    
    // If input is receiving, curve inwards from the left
    const cp2x = startDirection === 'out' ? x2 - cpOffset : x2 + cpOffset;
    const cp2y = y2;

    return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
  }

  /**
   * Get canvas coordinate of a port dot
   */
  getPortCoords(portSpec) {
    const portId = `port-${portSpec.direction}-${portSpec.nodeId}-${portSpec.portName}`;
    const dot = document.getElementById(portId);
    if (!dot) return { x: 0, y: 0 };

    const dotRect = dot.getBoundingClientRect();
    const svgRect = this.svg.getBoundingClientRect();

    // Map screen bounds to canvas coordinate grid accounting for scale
    const x = (dotRect.left + dotRect.width / 2 - svgRect.left) / this.graphCanvas.scale;
    const y = (dotRect.top + dotRect.height / 2 - svgRect.top) / this.graphCanvas.scale;

    return { x, y };
  }

  /**
   * Toggle port highlights to show valid connection targets
   */
  togglePortHighlights(highlight, currentDir) {
    const allDots = document.querySelectorAll('.port-dot');
    const activeType = this.activeDragPort ? (this.activeDragPort.dotEl.dataset.porttype || 'text') : null;

    for (const dot of allDots) {
      if (highlight) {
        // Highlight opposite ports with MATCHING datatypes
        if (dot.dataset.direction !== currentDir && 
            dot.dataset.node !== this.activeDragPort.nodeId &&
            (dot.dataset.porttype || 'text') === activeType) {
          dot.classList.add('port-active-connect');
        }
      } else {
        dot.classList.remove('port-active-connect');
      }
    }
  }

  /**
   * Establish a new logic connection
   */
  createConnection(fromNode, fromPort, toNode, toPort) {
    // Rule: Input ports only support ONE incoming connection
    // Check if input is already connected and remove old one
    const duplicate = this.connections.find(c => c.toNode === toNode && c.toPort === toPort);
    if (duplicate) {
      this.removeConnection(duplicate.id);
    }

    const connId = `conn_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    pathEl.setAttribute('class', 'wire');
    pathEl.dataset.id = connId;

    // Double click to delete connection
    pathEl.addEventListener('dblclick', () => {
      this.removeConnection(connId);
      // Trigger simple log update
      const event = new CustomEvent('connection-removed', { detail: { fromNode, fromPort, toNode, toPort } });
      window.dispatchEvent(event);
    });

    this.svg.appendChild(pathEl);

    // Create wire delete midpoint handle
    const handleEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    handleEl.setAttribute('class', 'wire-delete-handle');
    handleEl.setAttribute('r', '6');
    handleEl.dataset.id = connId;

    handleEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeConnection(connId);
      const event = new CustomEvent('connection-removed', { detail: { fromNode, fromPort, toNode, toPort } });
      window.dispatchEvent(event);
    });

    this.svg.appendChild(handleEl);

    const connection = { id: connId, fromNode, fromPort, toNode, toPort, pathEl, handleEl };
    this.connections.push(connection);

    // Update highlights
    this.setPortConnectedState(fromNode, fromPort, 'out', true);
    this.setPortConnectedState(toNode, toPort, 'in', true);

    this.updateConnectionLine(connection);

    if (this.onConnectionChange) {
      this.onConnectionChange(toNode, toPort, true);
    }

    return connection;
  }

  /**
   * Remove a connection
   */
  removeConnection(connId) {
    const index = this.connections.findIndex(c => c.id === connId);
    if (index === -1) return;

    const conn = this.connections[index];
    conn.pathEl.remove();
    if (conn.handleEl) {
      conn.handleEl.remove();
    }
    this.connections.splice(index, 1);

    // Update port connected state if no other wires connected
    this.checkAndUpdatePortState(conn.fromNode, conn.fromPort, 'out');
    this.checkAndUpdatePortState(conn.toNode, conn.toPort, 'in');

    if (this.onConnectionChange) {
      this.onConnectionChange(conn.toNode, conn.toPort, false);
    }
  }

  /**
   * Set visual connection glow on port dots
   */
  setPortConnectedState(nodeId, portName, direction, connected) {
    const portId = `port-${direction}-${nodeId}-${portName}`;
    const dot = document.getElementById(portId);
    if (dot) {
      if (connected) {
        dot.classList.add('port-connected');
      } else {
        dot.classList.remove('port-connected');
      }
    }
  }

  /**
   * Re-verify if port has any active connections left
   */
  checkAndUpdatePortState(nodeId, portName, direction) {
    const hasConns = this.connections.some(c => 
      (direction === 'out' && c.fromNode === nodeId && c.fromPort === portName) ||
      (direction === 'in' && c.toNode === nodeId && c.toPort === portName)
    );
    this.setPortConnectedState(nodeId, portName, direction, hasConns);
  }

  /**
   * Render wire lines connecting two ports
   */
  updateConnectionLine(conn) {
    const fromCoords = this.getPortCoords({ nodeId: conn.fromNode, portName: conn.fromPort, direction: 'out' });
    const toCoords = this.getPortCoords({ nodeId: conn.toNode, portName: conn.toPort, direction: 'in' });

    const x1 = fromCoords.x;
    const y1 = fromCoords.y;
    const x2 = toCoords.x;
    const y2 = toCoords.y;

    const pathData = this.calculateBezier(x1, y1, x2, y2, 'out');
    conn.pathEl.setAttribute('d', pathData);

    // Calculate midpoint of cubic Bezier curve at t = 0.5
    const dist = Math.abs(x2 - x1);
    const cpOffset = Math.max(50, dist * 0.45);
    const cp1x = x1 + cpOffset;
    const cp1y = y1;
    const cp2x = x2 - cpOffset;
    const cp2y = y2;

    const midX = 0.125 * x1 + 0.375 * cp1x + 0.375 * cp2x + 0.125 * x2;
    const midY = 0.125 * y1 + 0.375 * cp1y + 0.375 * cp2y + 0.125 * y2;

    if (conn.handleEl) {
      conn.handleEl.setAttribute('cx', midX);
      conn.handleEl.setAttribute('cy', midY);
    }
  }

  /**
   * Redraw all connections linked to a specific node
   */
  redrawNodeConnections(nodeId) {
    const linkedConns = this.connections.filter(c => c.fromNode === nodeId || c.toNode === nodeId);
    for (const conn of linkedConns) {
      this.updateConnectionLine(conn);
    }
  }

  /**
   * Set wire visual style to "running" state
   */
  setWireRunning(nodeId, isRunning) {
    for (const c of this.connections) {
      if (c.fromNode === nodeId) {
        if (isRunning) {
          c.pathEl.classList.add('running-wire');
        } else {
          c.pathEl.classList.remove('running-wire');
          c.pathEl.classList.add('active-wire');
        }
      }
    }
  }

  /**
   * Reset running animation state on all wires
   */
  resetAllWireAnimations() {
    for (const c of this.connections) {
      c.pathEl.classList.remove('running-wire', 'active-wire');
    }
  }

  /**
   * Delete all connections associated with a node ID
   */
  clearNodeConnections(nodeId) {
    const linkedConns = this.connections.filter(c => c.fromNode === nodeId || c.toNode === nodeId);
    for (const conn of linkedConns) {
      this.removeConnection(conn.id);
    }
  }

  /**
   * Delete every connection on the canvas
   */
  clearAll() {
    // Clone array to avoid index mutation while deleting
    const ids = this.connections.map(c => c.id);
    for (const id of ids) {
      this.removeConnection(id);
    }
  }

  /**
   * Serialize all connections
   */
  serialize() {
    return this.connections.map(c => ({
      fromNode: c.fromNode,
      fromPort: c.fromPort,
      toNode: c.toNode,
      toPort: c.toPort
    }));
  }
}
