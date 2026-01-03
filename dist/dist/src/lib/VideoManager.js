"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoManager = void 0;
const child_process_1 = require("child_process");
const ws_1 = require("ws");
const events_1 = require("events");
class VideoManager extends events_1.EventEmitter {
    wsPort;
    ffmpegProcess = null;
    pythonProcess = null;
    wss = null;
    activeClients = new Set();
    constructor(wsPort = 9999) {
        super();
        this.wsPort = wsPort;
    }
    startServer() {
        if (this.wss)
            return;
        this.wss = new ws_1.WebSocketServer({ port: this.wsPort });
        this.wss.on('connection', (ws) => {
            this.activeClients.add(ws);
            ws.on('close', () => this.activeClients.delete(ws));
        });
        console.log(`Video WebSocket server started on port ${this.wsPort}`);
    }
    stopServer() {
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
    }
    broadcast(chunk) {
        for (const client of this.activeClients) {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(chunk);
            }
        }
    }
    async startSimulation(command, scriptPath, recordingPath) {
        this.stopAll();
        this.startServer();
        // 1. Spawn Python Simulation
        // It expects to write raw RGB24 640x480 frames to stdout
        const args = scriptPath ? [scriptPath] : [];
        this.pythonProcess = (0, child_process_1.spawn)(command, args, {
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
            '-i', 'pipe:0',
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
            'pipe:1' // Write to stdout
        ];
        this.ffmpegProcess = (0, child_process_1.spawn)('ffmpeg', ffmpegArgs, {
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
            this.ffmpegProcess.stdout.on('data', (chunk) => {
                this.broadcast(chunk);
            });
        }
    }
    async startCamera(devicePath, recordingPath) {
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
        this.ffmpegProcess = (0, child_process_1.spawn)('ffmpeg', ffmpegArgs, {
            stdio: ['ignore', 'pipe', 'inherit']
        });
        this.ffmpegProcess.on('error', (err) => console.error('FFmpeg spawn error:', err));
        this.ffmpegProcess.on('exit', (code) => console.log('FFmpeg exited with:', code));
        if (this.ffmpegProcess.stdout) {
            this.ffmpegProcess.stdout.on('data', (chunk) => {
                this.broadcast(chunk);
            });
        }
    }
    async startRTSP(url, recordingPath) {
        this.stopAll();
        this.startServer();
        const ffmpegArgs = [
            '-rtsp_transport', 'tcp',
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
        this.ffmpegProcess = (0, child_process_1.spawn)('ffmpeg', ffmpegArgs, {
            stdio: ['ignore', 'pipe', 'inherit']
        });
        this.ffmpegProcess.on('error', (err) => console.error('FFmpeg spawn error:', err));
        this.ffmpegProcess.on('exit', (code) => console.log('FFmpeg exited with:', code));
        if (this.ffmpegProcess.stdout) {
            this.ffmpegProcess.stdout.on('data', (chunk) => {
                this.broadcast(chunk);
            });
        }
    }
    stopAll() {
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
exports.VideoManager = VideoManager;
//# sourceMappingURL=VideoManager.js.map