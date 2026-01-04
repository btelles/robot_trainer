const path = require('path');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const { VideoManager } = require('../dist/src/lib/VideoManager');

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const simulateBin = path.join(projectRoot, 'src', 'python', 'dist', 'simulate');
  if (!fs.existsSync(simulateBin)) {
    console.error('simulate binary not found at', simulateBin);
    process.exit(1);
  }

  const vm = new VideoManager(9999);
  const recordingPath = path.join(projectRoot, 'src', 'python', 'dist', 'test_recording.mp4');

  console.log('Starting VideoManager...');
  await vm.startSimulation(simulateBin, [], recordingPath);

  // simple HTTP server to serve jsmpeg client
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>JSMpeg Test</title>
</head>
<body>
  <h3>JSMpeg Test Player</h3>
  <canvas id="videoCanvas" width="640" height="480"></canvas>
  <script src="/lib/jsmpeg.min.js"></script>
  <script>
    const url = 'ws://localhost:9999';
    const canvas = document.getElementById('videoCanvas');
    const player = new JSMpeg.Player(url, { canvas: canvas, autoplay: true });
    console.log('Player started', player);
  </script>
</body>
</html>`;

  const staticLibDir = path.join(projectRoot, 'dist', 'src', 'lib');

  const server = http.createServer((req, res) => {
    if (req.url === '/' ) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    // Serve static files from ../dist/src/lib under /lib/
    if (req.url && req.url.startsWith('/lib/')) {
      const rel = req.url.replace(/^\/lib\//, '');
      const filePath = path.join(staticLibDir, rel);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(3000, () => {
    console.log('HTTP test server running at http://localhost:3000');
    console.log('Open that URL in a browser to view JSMpeg playback.');
  });

  // Connect a WS client to verify we receive data
  const ws = new WebSocket('ws://localhost:9999');
  const out = fs.createWriteStream('/tmp/vm_ws_capture.ts');
  let received = 0;
  ws.on('open', () => console.log('Test WS client connected'));
  ws.on('message', (data) => {
    received += data.length;
    if (!out.destroyed) out.write(data);
    if (received > 32 * 1024) {
      console.log('Received >32KB over WS; closing test client.');
      ws.close();
      out.end();
      // keep server running so user can open browser
      console.log('Saved sample to /tmp/vm_ws_capture.ts');
    }
  });

  ws.on('error', (err) => console.error('WS client error', err));

  process.on('SIGINT', async () => {
    console.log('Stopping...');
    ws.close();
    server.close();
    vm.stopAll();
    vm.stopServer();
    process.exit(0);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
