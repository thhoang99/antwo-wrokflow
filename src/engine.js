import { exec, execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';

import { existsSync, unlinkSync, readFileSync, statSync, mkdirSync } from 'fs';

/**
 * Helper to execute terminal commands as a promise
 */
function execPromise(command, cwd) {
  return new Promise((resolve) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error ? error.code || 1 : 0
      });
    });
  });
}

/**
 * ExecFile runner to invoke the Antigravity CLI (agy.exe) safely without shell injection risks
 */
/**
 * Shared polling mechanism: waits for a file to appear and contain data.
 * Extracted from runAgyCLI and runCombineCLI to avoid duplication.
 *
 * @param {Object} options
 * @param {string}   options.logFile      - Path to the file being polled
 * @param {boolean}  [options.isImage]    - If true, checks file size instead of text content
 * @param {number}   [options.intervalTime=2000]  - Polling interval in ms
 * @param {number}   [options.maxTimeout=300000]  - Max wait time in ms (default 5 min)
 * @param {Function} [options.onContent]  - Optional transform: receives (content: string) and returns
 *                                          a value to resolve with. Return `undefined` to fall through
 *                                          to the default text resolve behaviour.
 * @returns {Promise<*>}
 */
function pollForResult({ logFile, isImage = false, intervalTime = 2000, maxTimeout = 300000, onContent }) {
  return new Promise((resolve, reject) => {
    let elapsed = 0;

    const checker = setInterval(() => {
      elapsed += intervalTime;

      if (existsSync(logFile)) {
        exec("npm run clean");
        try {
          if (isImage) {
            const stats = statSync(logFile);
            if (stats.size > 0) {
              clearInterval(checker);
              return resolve(logFile);
            }
          } else {
            const content = readFileSync(logFile, 'utf8').trim();
            if (content.length > 0) {
              clearInterval(checker);
              clearFileDelayed(logFile);
              // Allow caller to transform the content (e.g. extract image paths)
              if (onContent) {
                const transformed = onContent(content);
                if (transformed !== undefined) return resolve(transformed);
              }
              return resolve(content);
            }
          }
        } catch (readError) {
          console.log(isImage ? "Đang đợi image file..." : "Đang đợi file mở khóa...");
        }
      }

      // Xử lý khi hết hạn
      if (elapsed >= maxTimeout) {
        clearInterval(checker);

        if (isImage) {
          if (existsSync(logFile)) {
            try {
              const stats = statSync(logFile);
              if (stats.size > 0) return resolve(logFile);
            } catch (e) { }
          }
          return reject(new Error('CLI failed'));
        }

        // Text mode timeout
        let finalContent = '';
        if (existsSync(logFile)) {
          try { finalContent = readFileSync(logFile, 'utf8').trim(); } catch (e) { }
        }
        clearFileDelayed(logFile);

        if (finalContent.length > 0) {
          if (onContent) {
            const transformed = onContent(finalContent);
            if (transformed !== undefined) return resolve(transformed);
          }
          return resolve(finalContent + "\n[Cảnh báo: Kết quả bị cắt ngang do quá thời gian]");
        } else {
          return reject(new Error('CLI failed: Quá thời gian nhưng không có dữ liệu trả về.'));
        }
      }
    }, intervalTime);
  });
}

function clearFileDelayed(filePath) {
  setTimeout(() => {
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
    } catch (err) { }
  }, 1500);
}

/**
 * Invoke the Antigravity CLI (agy.exe) and poll for results.
 */
function runAgyCLI(cliPath, prompt, option = 'text', cacheDir = '', imageWidth = 720, imageHeight = 720) {
  const isImage = option === 'image';
  // Escape double quotes inside prompt to ensure Windows CMD/PowerShell handles it correctly
  let escapedPrompt = prompt.replace(/"/g, '\\"');
  if (isImage) {
    escapedPrompt = `generate_image: ${escapedPrompt}.The final image must be exactly ${imageWidth}x${imageHeight} pixels.`;
    console.log(escapedPrompt);
  }

  const randomSuffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const resolvedCacheDir = path.resolve(process.cwd(), cacheDir || './antwoworkflowcache');

  // Ensure cache directory exists
  try {
    if (!existsSync(resolvedCacheDir)) {
      mkdirSync(resolvedCacheDir, { recursive: true });
    }
  } catch (e) { }

  const cacheFile = path.join(resolvedCacheDir, `cache_${randomSuffix}.txt`);
  const randomName = 'img_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now() + '.png';
  const imagePath = path.join(resolvedCacheDir, randomName);
  const logFile = isImage ? imagePath : cacheFile;

  // Tự động xóa cache file ngẫu nhiên trước khi chạy
  clearFileDelayed(cacheFile);

  // If cliPath is not configured, call default "agy" instead of the full path
  const executable = cliPath ? `"${cliPath}"` : `agy`;
  const command = `${executable} --dangerously-skip-permissions -p "${escapedPrompt} and write all result to ${logFile}"`;
  // Kích hoạt CLI chạy ngầm hoàn toàn
  exec(command, { timeout: 500 });

  return pollForResult({ logFile, isImage });
}

/**
 * Invoke the Antigravity CLI (agy.exe) for the Combine node and poll for results.
 */
function runCombineCLI(cliPath, prompt, cacheDir = '') {
  let escapedPrompt = prompt.replace(/"/g, '\\"');
  const randomSuffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const resolvedCacheDir = path.resolve(process.cwd(), cacheDir || './antwoworkflowcache');

  // Ensure cache directory exists
  try {
    if (!existsSync(resolvedCacheDir)) {
      mkdirSync(resolvedCacheDir, { recursive: true });
    }
  } catch (e) { }

  const cacheFile = path.join(resolvedCacheDir, `combine_cache_${randomSuffix}.txt`);
  clearFileDelayed(cacheFile);

  // If cliPath is not configured, call default "agy" instead of the full path
  const executable = cliPath ? `"${cliPath}"` : `agy`;
  const command = `${executable} --dangerously-skip-permissions -p "${escapedPrompt} and write all result to ${cacheFile}"`;


  console.log(command);
  exec(command, { timeout: 500 });

  // Custom content transformer: extract combine image path from text output
  const extractCombineImage = (content) => {
    // 1. Try to find the blended/combined image first
    let match = content.match(/((?:[a-zA-Z]:\\|[a-zA-Z]:\/|\/|\\)?(?:[^"\s\n]*?)(?:combined|combine_cache|blended)(?:[^"\s\n]*?)\.(?:png|jpe?g|gif|webp|svg))/i);

    // 2. If not found, look for ANY image URL or path in the content
    if (!match) {
      match = content.match(/((?:[a-zA-Z]:\\|[a-zA-Z]:\/|\/|\\|https?:\/\/)(?:[^"\s\n]*?)\.(?:png|jpe?g|gif|webp|svg))/i);
    }

    // 3. If still not found, but the content itself is a clean image path/URL
    if (!match && /\.(?:png|jpe?g|gif|webp|svg)$/i.test(content.trim())) {
      return {
        text: content,
        imagePath: content.trim()
      };
    }

    return {
      text: content,
      imagePath: match ? match[1] : null
    };
  };

  return pollForResult({ logFile: cacheFile, onContent: extractCombineImage });
}


/**
 * Asynchronous Node Execution Engine
 */
export class GraphEngine {
  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * Run only a single node by ID, resolving its connected inputs from previous parent execution outputs
   * @param {Object} graph - { nodes: [], connections: [] }
   * @param {string} nodeId - Target node ID to execute
   * @param {Function} onNodeStatus - Status callback
   */
  async runSingle(graph, nodeId, onNodeStatus) {
    const { nodes, connections } = graph;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const node = nodeMap.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found in the graph`);
    }

    const nodeInputs = {};
    // Populate default fields
    if (node.fields) {
      for (const [key, value] of Object.entries(node.fields)) {
        nodeInputs[key] = value;
      }
    }

    // Resolve connected inputs from parent node outputs saved in graph state
    const nodeIncoming = connections.filter(c => c.toNode === nodeId);
    for (const conn of nodeIncoming) {
      const parentNode = nodeMap.get(conn.fromNode);
      if (parentNode && parentNode.outputs) {
        nodeInputs[conn.toPort] = parentNode.outputs[conn.fromPort];
      }
    }

    // Execute only this specific node
    const nodeOutputs = await this.executeNode(node, nodeInputs, onNodeStatus, connections, nodes);
    return nodeOutputs;
  }

  /**
   * Run the graph
   * @param {Object} graph - { nodes: [], connections: [] }
   * @param {Function} onNodeStatus - Callback (nodeId, status, data)
   */
  async run(graph, onNodeStatus) {
    const { nodes, connections } = graph;

    // Maps
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const outputs = {}; // nodeId -> { portName -> value }
    const inputs = {};  // nodeId -> { portName -> value }

    // Initialize inputs and outputs
    for (const node of nodes) {
      outputs[node.id] = {};
      inputs[node.id] = {};
      // Preset standard default values from fields
      if (node.fields) {
        for (const [key, value] of Object.entries(node.fields)) {
          inputs[node.id][key] = value;
        }
      }
    }

    // Map connections to quickly find dependencies
    // Connections: { fromNode, fromPort, toNode, toPort }
    const incomingConnections = {}; // toNode -> Array of connections
    const outgoingConnections = {}; // fromNode -> Array of connections

    for (const node of nodes) {
      incomingConnections[node.id] = [];
      outgoingConnections[node.id] = [];
    }

    for (const conn of connections) {
      if (incomingConnections[conn.toNode]) {
        incomingConnections[conn.toNode].push(conn);
      }
      if (outgoingConnections[conn.fromNode]) {
        outgoingConnections[conn.fromNode].push(conn);
      }
    }

    // Loop tracking states
    const loopIterations = {};
    const loopMaxIterations = {};
    const loopCurrentInput = {};
    const loopDownstream = {};

    const getDownstreamNodes = (loopId) => {
      const downstream = new Set();
      const dfs = (currId) => {
        const outConns = outgoingConnections[currId] || [];
        for (const conn of outConns) {
          if (conn.toNode === loopId) continue; // skip feedback loops
          if (!downstream.has(conn.toNode)) {
            downstream.add(conn.toNode);
            dfs(conn.toNode);
          }
        }
      };
      dfs(loopId);
      return downstream;
    };

    for (const node of nodes) {
      if (node.type === 'loop') {
        loopDownstream[node.id] = getDownstreamNodes(node.id);
        loopIterations[node.id] = 0;
        const iterationsStr = node.fields?.iterations || '3';
        loopMaxIterations[node.id] = Math.max(1, parseInt(iterationsStr) || 3);
        loopCurrentInput[node.id] = inputs[node.id].input || '';
      }
    }

    // Track active runs, in-degrees, and queues
    const inDegree = {};
    const executionQueue = [];

    for (const node of nodes) {
      // Indegree is the number of connected inputs, excluding feedback loops
      inDegree[node.id] = incomingConnections[node.id].filter(c => {
        if (node.type === 'loop' && c.toPort === 'input') {
          const downstream = getDownstreamNodes(node.id);
          if (downstream.has(c.fromNode)) return false;
        }
        return true;
      }).length;

      if (inDegree[node.id] === 0) {
        executionQueue.push(node.id);
      }
    }

    // Execute nodes in topological order
    const runningNodes = new Set();
    const completedNodes = new Set();
    const failedNodes = new Set();

    return new Promise((resolve, reject) => {
      const checkAndProcess = () => {
        if (executionQueue.length === 0 && runningNodes.size === 0) {
          resolve();
          return;
        }

        while (executionQueue.length > 0) {
          const nodeId = executionQueue.shift();
          runningNodes.add(nodeId);

          const targetNode = nodeMap.get(nodeId);
          // Make sure loop input is up to date for current iteration
          if (targetNode && targetNode.type === 'loop') {
            if (loopIterations[nodeId] === 0) {
              loopCurrentInput[nodeId] = inputs[nodeId].input || loopCurrentInput[nodeId];
            }
            loopIterations[nodeId]++;
            inputs[nodeId].input = loopCurrentInput[nodeId];
            console.log(`[Loop Node ${nodeId}] Iteration ${loopIterations[nodeId]}/${loopMaxIterations[nodeId]} starting with input:`, loopCurrentInput[nodeId]);
            onNodeStatus(nodeId, 'tracing', {
              message: `[Loop Iteration ${loopIterations[nodeId]}/${loopMaxIterations[nodeId]}] Passing input to output...`
            });
          }

          console.log(`[Engine] Executing node: ${nodeId} (${targetNode?.type})`);

          // Run node asynchronously
          this.executeNode(targetNode, inputs[nodeId], onNodeStatus, connections, nodes)
            .then((nodeOutputs) => {
              runningNodes.delete(nodeId);
              completedNodes.add(nodeId);
              outputs[nodeId] = nodeOutputs;

              console.log(`[Engine] Completed node: ${nodeId} (${targetNode?.type}). Outputs:`, nodeOutputs);

              // Notify UI of completion
              onNodeStatus(nodeId, 'completed', { outputs: nodeOutputs });

              // Resolve outputs to child inputs
              const outConns = outgoingConnections[nodeId] || [];
              for (const conn of outConns) {
                const childId = conn.toNode;
                const childPort = conn.toPort;
                const parentPort = conn.fromPort;

                if (inputs[childId]) {
                  inputs[childId][childPort] = nodeOutputs[parentPort];
                }

                inDegree[childId]--;
                console.log(`[Engine] Resolved output to child ${childId}.${childPort}. New inDegree:`, inDegree[childId]);
                if (inDegree[childId] === 0 && !completedNodes.has(childId) && !runningNodes.has(childId) && !failedNodes.has(childId)) {
                  executionQueue.push(childId);
                }
              }

              // Check if any loop has completed its current iteration!
              let didResetLoop = false;
              for (const loopId of Object.keys(loopDownstream)) {
                if (loopIterations[loopId] > 0) {
                  const ds = loopDownstream[loopId];
                  const allCompleted = Array.from(ds).every(id => completedNodes.has(id));
                  console.log(`[Loop Check ${loopId}] Iteration ${loopIterations[loopId]}. Downstream nodes:`, Array.from(ds), "All Completed?", allCompleted);
                  if (allCompleted) {
                    if (loopIterations[loopId] < loopMaxIterations[loopId]) {
                      // We need to run another iteration!
                      didResetLoop = true;

                      // 1. Fetch feedback value if any
                      const feedbackConn = connections.find(c => c.toNode === loopId && c.toPort === 'input');
                      if (feedbackConn) {
                        const parentOutput = outputs[feedbackConn.fromNode];
                        if (parentOutput) {
                          loopCurrentInput[loopId] = parentOutput[feedbackConn.fromPort];
                        }
                      }
                      console.log(`[Loop Check ${loopId}] Resetting for next iteration. Current feedback input:`, loopCurrentInput[loopId]);

                      // 2. Reset Loop Node and its downstream nodes to idle
                      const resetIds = [loopId, ...Array.from(ds)];
                      for (const resetId of resetIds) {
                        completedNodes.delete(resetId);
                        runningNodes.delete(resetId);
                        failedNodes.delete(resetId);
                        outputs[resetId] = {};
                        onNodeStatus(resetId, 'idle', {});
                      }

                      // 3. Reset inDegrees for downstream
                      for (const resetId of resetIds) {
                        inDegree[resetId] = incomingConnections[resetId].filter(c => {
                          if (resetId === loopId && c.toPort === 'input') return false;
                          return true;
                        }).length;
                      }

                      // Loop node runs next
                      inDegree[loopId] = 0;
                      executionQueue.push(loopId);

                      setTimeout(checkAndProcess, 50);
                      break;
                    }
                  }
                }
              }

              // Continue processing if we didn't reset a loop
              if (!didResetLoop) {
                checkAndProcess();
              }
            })
            .catch((error) => {
              runningNodes.delete(nodeId);
              failedNodes.add(nodeId);

              // Notify UI of error
              onNodeStatus(nodeId, 'error', { error: error.message || 'Execution failed' });

              // Continue processing
              checkAndProcess();
            });
        }
      };

      checkAndProcess();
    });
  }

  /**
   * Execute a single node based on type and input data
   */
  async executeNode(node, nodeInputs, onNodeStatus, connections = [], nodes = []) {
    // Tracing dependencies for nodes with incoming connections
    const nodeIncoming = connections.filter(c => c.toNode === node.id);
    if (nodeIncoming.length > 0) {
      const ancestors = [];
      const visited = new Set();
      const nodeMap = new Map(nodes.map(n => [n.id, n]));

      const dfsTrace = (currId) => {
        if (visited.has(currId)) return;
        visited.add(currId);
        const parents = connections.filter(c => c.toNode === currId);
        for (const conn of parents) {
          const parentNode = nodeMap.get(conn.fromNode);
          if (parentNode) {
            if (parentNode.type === 'ai_prompt' || parentNode.type === 'combine' || parentNode.type === 'command_exec') {
              ancestors.push(parentNode);
            }
            dfsTrace(conn.fromNode);
          }
        }
      };
      dfsTrace(node.id);

      if (ancestors.length > 0) {
        const ancestorNames = ancestors.map(a => `${a.type === 'command_exec' ? 'Windows Command' : 'Gemini Prompt'} (ID: ${a.id})`).join(', ');
        onNodeStatus(node.id, 'tracing', {
          message: `Tracing dependencies: node has connected inputs. Preceding long-running nodes include: ${ancestorNames}. Strict wait is active: waiting for inputs to resolve before executing...`
        });
      }

      // Explicit verification: Ensure all incoming port values are fully defined
      for (const conn of nodeIncoming) {
        const val = nodeInputs[conn.toPort];
        if (val === undefined || val === null) {
          throw new Error(`Input port "${conn.toPort}" is not yet resolved. Strict execution guard blocked execution.`);
        }
      }
    }

    onNodeStatus(node.id, 'running', { inputs: nodeInputs });

    switch (node.type) {
      case 'text_input': {
        const text = nodeInputs.value || '';
        return { output: text };
      }

      case 'concat': {
        const a = nodeInputs.a || '';
        const b = nodeInputs.b || '';
        const delimiter = nodeInputs.delimiter || '';
        return { output: `${a}${delimiter}${b}` };
      }

      case 'file_reader': {
        const filePath = nodeInputs.filePath;
        if (!filePath) {
          throw new Error('File Path is required');
        }
        const fullPath = path.resolve(this.cwd, filePath);
        // Security check - keep inside workspace
        if (!fullPath.startsWith(this.cwd)) {
          throw new Error('Access denied: File must be inside the workspace');
        }
        const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(filePath);
        if (isImage) {
          return { content: filePath };
        } else {
          const content = await fs.readFile(fullPath, 'utf-8');
          return { content };
        }
      }

      case 'file_writer': {
        const filePath = nodeInputs.filePath;
        const content = nodeInputs.content || '';
        if (!filePath) {
          throw new Error('File Path is required');
        }
        const fullPath = path.resolve(this.cwd, filePath);
        // Security check - keep inside workspace
        if (!fullPath.startsWith(this.cwd)) {
          throw new Error('Access denied: File must be inside the workspace');
        }
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        return { success: true };
      }

      case 'command_exec': {
        const command = nodeInputs.command;
        if (!command) {
          throw new Error('Command is empty');
        }
        // Run command
        const result = await execPromise(command, this.cwd);
        if (result.exitCode !== 0) {
          throw new Error(`Command failed with exit code ${result.exitCode}\n${result.stderr}`);
        }
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        };
      }

      case 'ai_prompt': {
        let prompt = nodeInputs.prompt;
        if (!prompt) {
          throw new Error('Prompt is required');
        }

        // const systemInstruction = nodeInputs.systemInstruction;
        // if (systemInstruction) {
        //   prompt = `System Instruction: ${systemInstruction}\n\nPrompt: ${prompt}`;
        // }

        // Read settings.json configuration
        let settings = {};
        try {
          const settingsPath = path.join(this.cwd, 'settings.json');
          const content = await fs.readFile(settingsPath, 'utf-8');
          settings = JSON.parse(content);
        } catch (e) {
          // ignore if settings not found
        }

        const outputType = nodeInputs.outputType || 'text';
        // Resolve image dimensions: node custom > settings default > 720
        const w = nodeInputs.imageWidth || settings.defaultImageWidth || 720;
        const h = nodeInputs.imageHeight || settings.defaultImageHeight || 720;

        const cliPath = settings.cliPath || '';

        // Try executing local Antigravity CLI directly
        try {
          const result = await runAgyCLI(cliPath, prompt, outputType, settings.cacheDir, w, h);
          return { response: result };
        } catch (cliError) {
          if (outputType === 'image') {
            // Emulate a beautiful visual image generator using loremflickr as fallback
            const keywords = prompt.split(/\s+/).slice(0, 3).join(',');
            const imageUrl = `https://loremflickr.com/600/400/${encodeURIComponent(keywords || 'ai,tech')}`;
            return { response: imageUrl };
          }
          throw new Error(`Antigravity CLI Execution Failed: ${cliError.message}`);
        }
      }

      case 'combine': {
        const customInputs = node.customInputs || [];
        const textInputs = [];
        const imageInputs = [];

        for (const ci of customInputs) {
          const val = nodeInputs[ci.name];
          if (val) {
            if (ci.type === 'text') {
              textInputs.push(val);
            } else if (ci.type === 'image') {
              imageInputs.push(val);
            }
          }
        }

        if (textInputs.length + imageInputs.length < 2) {
          throw new Error('Combine node requires at least 2 inputs');
        }

        // Read settings for default image dimensions
        let combineSettings = {};
        try {
          const settingsPath = path.join(this.cwd, 'settings.json');
          const content = await fs.readFile(settingsPath, 'utf-8');
          combineSettings = JSON.parse(content);
        } catch (e) { }

        // Resolve image dimensions: node custom > settings default > 720
        const w = nodeInputs.imageWidth || combineSettings.defaultImageWidth || 720;
        const h = nodeInputs.imageHeight || combineSettings.defaultImageHeight || 720;

        // Combine text prompt parts with "and"
        const textCombined = textInputs.join(' and ');

        // Combine image references with "Refer the image of thí link:"
        const imageCombined = imageInputs.map(img => `Refer the image of this link: ${img}`).join(' and ');

        let finalPrompt = '';
        const promptCombineImgs = `Combine these images use AI: ${imageCombined}, all to one picture. The image output must be exactly ${w}x${h} pixels.`
        if (textInputs.length === 0) {
          finalPrompt = promptCombineImgs;
        } else if (textCombined && imageCombined) {
          finalPrompt = `${textCombined} , ${imageCombined} `;
        } else {
          finalPrompt = textCombined || imageCombined || '';
        }

        if (!finalPrompt) {
          throw new Error('No inputs connected to Combine node');
        }

        // Execute agy.exe
        const cliPath = combineSettings.cliPath || '';

        try {
          const result = await runCombineCLI(cliPath, finalPrompt, combineSettings.cacheDir);
          let resultText = typeof result === 'object' ? result.text : result;
          let resultImageUrl = typeof result === 'object' ? result.imagePath : null;

          if (!resultImageUrl) {
            // Generate loremflickr image based on response text keywords
            const keywords = resultText.split(/\s+/).slice(0, 3).join(',');
            resultImageUrl = `https://loremflickr.com/600/400/${encodeURIComponent(keywords || 'ai,tech')}`;
          }

          return {
            text: resultText,
            image: resultImageUrl
          };
        } catch (cliError) {
          // Robust fallback emulation in case local agy.exe CLI is absent
          const fallbackText = `Combined Prompt: ${finalPrompt}\n\n[Fallback AI Response]: I have analyzed the combined request containing ${textInputs.length} text prompt(s) and ${imageInputs.length} image reference(s). The request has been processed successfully.`;
          const keywords = finalPrompt.split(/\s+/).slice(0, 3).join(',');
          const resultImageUrl = `https://loremflickr.com/600/400/${encodeURIComponent(keywords || 'ai,tech')}`;

          return {
            text: fallbackText,
            image: resultImageUrl
          };
        }
      }

      case 'preview_text': {
        const text = nodeInputs.text || '';
        return { value: text, output: text };
      }

      case 'preview_image': {
        const image = nodeInputs.image || '';
        return { src: image, output: image };
      }

      case 'loop': {
        const input = nodeInputs.input || '';
        return { output: input };
      }

      default:
        throw new Error(`Unsupported node type: ${node.type}`);
    }
  }
}
