// Touch to trigger watch reload
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { exec, execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { GraphEngine } from './src/engine.js';

const app = express();
const port = 3000;
const server = createServer(app);
const wss = new WebSocketServer({ server });

const CWD = process.cwd();
const WORKFLOWS_DIR = path.join(CWD, 'workflows');

// Ensure workflows directory exists
async function ensureDir() {
  try {
    await fs.mkdir(WORKFLOWS_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create workflows directory:', err);
  }
}
ensureDir();

// Load local .env environment variables to enable real AI generations
async function loadEnv() {
  try {
    const envPath = path.join(CWD, '.env');
    const envContent = await fs.readFile(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        let val = parts.slice(1).join('=').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[key] = val;
      }
    }
    console.log('Loaded environment configurations from .env');
  } catch (err) {
    // .env doesn't exist, ignore
  }
}
loadEnv();

// CORS Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Serve workspace directory statically on /workspace
app.use('/workspace', express.static(CWD));

// Serve absolute local files securely (bypasses browser file protocol restrictions)
app.get('/api/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ success: false, error: 'Path parameter is required' });
  }
  res.sendFile(path.resolve(filePath), (err) => {
    if (err) {
      if (!res.headersSent) {
        res.status(404).json({ success: false, error: 'File not found or access denied' });
      }
    }
  });
});

// API: Upload a file to the workspace
app.post('/api/upload', async (req, res) => {
  try {
    const { filename, base64Data } = req.body;
    if (!filename || !base64Data) {
      return res.status(400).json({ success: false, error: 'Filename and base64Data are required' });
    }
    const buffer = Buffer.from(base64Data, 'base64');
    const filePath = path.join(CWD, filename);
    await fs.writeFile(filePath, buffer);
    res.json({ success: true, filePath: filename });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: List saved workflows
app.get('/api/workflows', async (req, res) => {
  try {
    const files = await fs.readdir(WORKFLOWS_DIR);
    const workflows = files
      .filter(file => file.endsWith('.json'))
      .map(file => path.basename(file, '.json'));
    res.json({ success: true, workflows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const SETTINGS_FILE = path.join(CWD, 'settings.json');
const DEFAULT_SETTINGS = {
  cliPath: '',
  cacheDir: './antwoworkflowcache',
  defaultImageWidth: 512,
  defaultImageHeight: 512
};

// API: Get settings
app.get('/api/settings', async (req, res) => {
  try {
    let settings = { ...DEFAULT_SETTINGS };
    try {
      const content = await fs.readFile(SETTINGS_FILE, 'utf-8');
      const loaded = JSON.parse(content);
      settings.cliPath = loaded.cliPath !== undefined ? loaded.cliPath : DEFAULT_SETTINGS.cliPath;
      settings.cacheDir = loaded.cacheDir || DEFAULT_SETTINGS.cacheDir;
      settings.defaultImageWidth = loaded.defaultImageWidth !== undefined ? parseInt(loaded.defaultImageWidth) : DEFAULT_SETTINGS.defaultImageWidth;
      settings.defaultImageHeight = loaded.defaultImageHeight !== undefined ? parseInt(loaded.defaultImageHeight) : DEFAULT_SETTINGS.defaultImageHeight;
    } catch (e) {
      // create default settings.json
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    }
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Save settings
app.post('/api/settings', async (req, res) => {
  try {
    const { cliPath, cacheDir, defaultImageWidth, defaultImageHeight } = req.body;
    const settings = {
      cliPath: cliPath || '',
      cacheDir: cacheDir || DEFAULT_SETTINGS.cacheDir,
      defaultImageWidth: defaultImageWidth !== undefined ? Math.min(2048, Math.max(1, parseInt(defaultImageWidth) || 512)) : DEFAULT_SETTINGS.defaultImageWidth,
      defaultImageHeight: defaultImageHeight !== undefined ? Math.min(2048, Math.max(1, parseInt(defaultImageHeight) || 512)) : DEFAULT_SETTINGS.defaultImageHeight
    };
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Clear temporary cache files in configured folder
app.post('/api/settings/clear-cache', async (req, res) => {
  try {
    let settings = { ...DEFAULT_SETTINGS };
    try {
      const content = await fs.readFile(SETTINGS_FILE, 'utf-8');
      settings = { ...settings, ...JSON.parse(content) };
    } catch (e) { }

    const cacheDir = settings.cacheDir || CWD;
    const resolvedPath = path.resolve(cacheDir);

    // Safety guard to avoid deleting critical workspace files if cacheDir points to workspace root
    if (resolvedPath === CWD || resolvedPath === path.resolve(CWD, 'src') || resolvedPath === path.resolve(CWD, 'workflows')) {
      return res.status(400).json({ success: false, error: 'Safety block: Cannot delete all files in critical project directories.' });
    }

    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({ success: false, error: 'Configured path is not a directory' });
      }
    } catch (e) {
      return res.status(404).json({ success: false, error: 'Configured directory does not exist' });
    }

    const files = await fs.readdir(resolvedPath);
    let count = 0;
    for (const file of files) {
      try {
        const filePath = path.join(resolvedPath, file);
        await fs.rm(filePath, { recursive: true, force: true });
        count++;
      } catch (rmErr) {
        // Ignore transient files that are locked by active CLI processes
      }
    }

    res.json({ success: true, clearedCount: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get Gemini quota (Disabled)
app.get('/api/quota', (req, res) => {
  res.json({ success: false, error: 'Quota checking is disabled.' });
});

// API: Load workflow
app.get('/api/workflows/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const filePath = path.join(WORKFLOWS_DIR, `${name}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ success: true, graph: JSON.parse(content) });
  } catch (err) {
    res.status(404).json({ success: false, error: 'Workflow not found' });
  }
});

// API: Save workflow
app.post('/api/workflows', async (req, res) => {
  try {
    const { name, graph } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Workflow name is required' });
    }
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filePath = path.join(WORKFLOWS_DIR, `${sanitizedName}.json`);
    await fs.writeFile(filePath, JSON.stringify(graph, null, 2), 'utf-8');
    res.json({ success: true, filename: sanitizedName });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Delete workflow
app.delete('/api/workflows/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filePath = path.join(WORKFLOWS_DIR, `${sanitizedName}.json`);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// WebSocket orchestration
wss.on('connection', (ws) => {
  console.log('Client connected to antwo workflow execution channel');
  let isRunning = false;

  ws.on('message', async (message) => {
    try {
      const payload = JSON.parse(message);

      if (payload.type === 'run') {
        if (isRunning) {
          ws.send(JSON.stringify({ type: 'error', message: 'An execution is already in progress' }));
          return;
        }

        isRunning = true;
        ws.send(JSON.stringify({ type: 'system', message: 'Starting workflow execution engine...' }));

        const engine = new GraphEngine(CWD);

        await engine.run(payload.graph, (nodeId, status, data) => {
          ws.send(JSON.stringify({
            type: 'node_status',
            nodeId,
            status,
            data
          }));
        });

        ws.send(JSON.stringify({ type: 'system', message: 'Workflow execution complete.' }));
        isRunning = false;
      } else if (payload.type === 'run_single') {
        if (isRunning) {
          ws.send(JSON.stringify({ type: 'error', message: 'An execution is already in progress' }));
          return;
        }

        isRunning = true;
        const nodeId = payload.nodeId;
        ws.send(JSON.stringify({ type: 'system', message: `Starting execution for single node ${nodeId}...` }));

        const engine = new GraphEngine(CWD);

        try {
          const nodeOutputs = await engine.runSingle(payload.graph, nodeId, (nId, status, data) => {
            ws.send(JSON.stringify({
              type: 'node_status',
              nodeId: nId,
              status,
              data
            }));
          });

          ws.send(JSON.stringify({
            type: 'node_status',
            nodeId,
            status: 'completed',
            data: { outputs: nodeOutputs }
          }));

          ws.send(JSON.stringify({ type: 'system', message: `Single node ${nodeId} execution complete.` }));
        } catch (err) {
          ws.send(JSON.stringify({
            type: 'node_status',
            nodeId,
            status: 'error',
            data: { error: err.message || 'Execution failed' }
          }));
        }

        isRunning = false;
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: `Execution Error: ${err.message}` }));
      isRunning = false;
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

server.listen(port, () => {
  console.log(`antwo workflow Backend Server running on http://localhost:${port}`);
});
