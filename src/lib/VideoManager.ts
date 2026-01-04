import { spawn, ChildProcess } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export class VideoManager extends EventEmitter {
  private ffmpegProcess: ChildProcess | null = null;
  private pythonProcess: ChildProcess | null = null;
  private wss: WebSocketServer | null = null;
  private activeClients: Set<WebSocket> = new Set();

  constructor(private wsPort: number = 9999) {
    super();
  }

  public startServer() {
    if (this.wss) return;
    this.wss = new WebSocketServer({ port: this.wsPort });
    this.wss.on('connection', (ws) => {
      this.activeClients.add(ws);
      ws.on('close', () => this.activeClients.delete(ws));
    });
    console.log(`Video WebSocket server started on port ${this.wsPort}`);
  }

  public stopServer() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  private broadcast(chunk: Buffer) {
    for (const client of this.activeClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(chunk);
      }
    }
  }

  private getFfmpegPath(): string {
    const platform = process.platform;
    let platformDir = '';
    let ext = '';
    if (platform === 'win32') {
      platformDir = 'win';
      ext = '.exe';
    } else if (platform === 'darwin') {
      platformDir = 'mac';
    } else if (platform === 'linux') {
      platformDir = 'linux';
    }

    const possiblePaths = [];
    
    if (app.isPackaged) {
       possiblePaths.push(path.join(process.resourcesPath, 'bin', platformDir, `ffmpeg${ext}`));
    } else {
       possiblePaths.push(path.join(app.getAppPath(), 'src', 'bin', platformDir, `ffmpeg${ext}`));
    }

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    console.warn('Bundled ffmpeg not found, falling back to system PATH');
    return 'ffmpeg';
  }

  public async startSimulation(command: string, args: string[], recordingPath: string) {
    this.stopAll();
    this.startServer();

    // 1. Spawn Python Simulation
    // It expects to write raw RGB24 640x480 frames to stdout
    this.pythonProcess = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'inherit'] // stdout piped
    });

    this.pythonProcess.on('error', (err) => console.error('Python spawn error:', err));
    this.pythonProcess.on('exit', (code) => console.log('Python exited with:', code));

    // 2. Spawn FFmpeg
    // Input: rawvideo from pipe:0
    // Output 1: H.264 MP4 to disk
    // Output 2: MPEG1 MPEG-TS to pipe:1 (for JSMpeg)
    const ffmpegArgs = [
      '-f', 'rawvideo',
      '-pixel_format', 'rgb24',
      '-video_size', '640x480',
      '-framerate', '30',
      '-i', 'pipe:0', // Read from stdin
      '-filter_complex', '[0:v]split=2[rec][stream]',
      
      // Output 1: Recording
      '-map', '[rec]',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-y', recordingPath,

      // Output 2: Stream
      '-map', '[stream]',
      '-c:v', 'mpeg1video',
      '-b:v', '1000k', // Bitrate
      '-bf', '0', // No B-frames for lower latency
      '-f', 'mpegts',
      'pipe:1' // Write to stdout
    ];

    this.ffmpegProcess = spawn(this.getFfmpegPath(), ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'inherit'] // stdin from python, stdout to WS
    });

    this.ffmpegProcess.on('error', (err) => console.error('FFmpeg spawn error:', err));
    this.ffmpegProcess.on('exit', (code) => console.log('FFmpeg exited with:', code));

    // Pipe Python stdout -> FFmpeg stdin
    if (this.pythonProcess.stdout && this.ffmpegProcess.stdin) {
      this.pythonProcess.stdout.pipe(this.ffmpegProcess.stdin);
    }

    // Pipe FFmpeg stdout -> WebSocket clients
    if (this.ffmpegProcess.stdout) {
      this.ffmpegProcess.stdout.on('data', (chunk: Buffer) => {
        this.broadcast(chunk);
      });
    }
  }

  public async startCamera(devicePath: string, recordingPath: string) {
    this.stopAll();
    this.startServer();

    // Input: V4L2 device
    const ffmpegArgs = [
      '-f', 'v4l2',
      '-framerate', '30',
      '-video_size', '640x480',
      '-i', devicePath,
      '-filter_complex', '[0:v]split=2[rec][stream]',
      
      // Output 1: Recording
      '-map', '[rec]',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-y', recordingPath,

      // Output 2: Stream
      '-map', '[stream]',
      '-c:v', 'mpeg1video',
      '-b:v', '1000k',
      '-bf', '0',
      '-f', 'mpegts',
      'pipe:1'
    ];

    this.ffmpegProcess = spawn(this.getFfmpegPath(), ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'inherit']
    });

    this.ffmpegProcess.on('error', (err) => console.error('FFmpeg spawn error:', err));
    this.ffmpegProcess.on('exit', (code) => console.log('FFmpeg exited with:', code));

    if (this.ffmpegProcess.stdout) {
      this.ffmpegProcess.stdout.on('data', (chunk: Buffer) => {
        this.broadcast(chunk);
      });
    }
  }

  public async startRTSP(url: string, recordingPath: string) {
    this.stopAll();
    this.startServer();

    const ffmpegArgs = [
      '-rtsp_transport', 'tcp', // Force TCP for reliability
      '-i', url,
      '-filter_complex', '[0:v]split=2[rec][stream]',
      
      // Output 1: Recording
      '-map', '[rec]',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-y', recordingPath,

      // Output 2: Stream
      '-map', '[stream]',
      '-c:v', 'mpeg1video',
      '-b:v', '1000k',
      '-bf', '0',
      '-f', 'mpegts',
      'pipe:1'
    ];

    this.ffmpegProcess = spawn(this.getFfmpegPath(), ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'inherit']
    });

    this.ffmpegProcess.on('error', (err) => console.error('FFmpeg spawn error:', err));
    this.ffmpegProcess.on('exit', (code) => console.log('FFmpeg exited with:', code));

    if (this.ffmpegProcess.stdout) {
      this.ffmpegProcess.stdout.on('data', (chunk: Buffer) => {
        this.broadcast(chunk);
      });
    }
  }

  public stopAll() {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.pythonProcess = null;
    }
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGINT'); // Allow graceful exit for MP4
      this.ffmpegProcess = null;
    }
  }
}
