const net = require('net');
const EventEmitter = require('events');

/**
 * Lightweight, zero-dependency Discord Rich Presence client.
 * Connects directly to Discord's local IPC pipe (`\\\\.\\pipe\\discord-ipc-0`)
 * with automatic reconnection and zero-crash guarantees.
 */
class DiscordRpcClient extends EventEmitter {
  constructor(clientId = '123456789012345678') {
    super();
    this.clientId = clientId;
    this.socket = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.currentActivity = null;
  }

  connect() {
    if (this.socket || this.connected) return;

    // Discord pipes range from discord-ipc-0 to discord-ipc-9
    let pipeIndex = 0;
    const tryNextPipe = () => {
      if (pipeIndex > 9) {
        this.scheduleReconnect();
        return;
      }

      const pipePath = process.platform === 'win32'
        ? `\\\\.\\pipe\\discord-ipc-${pipeIndex}`
        : `${process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || '/tmp'}/discord-ipc-${pipeIndex}`;

      const socket = net.createConnection(pipePath);

      socket.on('connect', () => {
        this.socket = socket;
        this.connected = true;
        this.sendHandshake();
        this.setupSocketListeners();
        console.log(`[DiscordRPC] Connected to Discord via ${pipePath}`);
        if (this.currentActivity) {
          this.setActivity(this.currentActivity);
        }
      });

      socket.on('error', () => {
        socket.destroy();
        pipeIndex++;
        tryNextPipe();
      });
    };

    tryNextPipe();
  }

  setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('close', () => {
      this.cleanup();
      this.scheduleReconnect();
    });

    this.socket.on('error', () => {
      this.cleanup();
      this.scheduleReconnect();
    });

    this.socket.on('data', () => {
      // Handle discord responses silently
    });
  }

  sendHandshake() {
    this.send(0, {
      v: 1,
      client_id: this.clientId
    });
  }

  send(op, data) {
    if (!this.socket || !this.connected) return;
    try {
      const payload = JSON.stringify(data);
      const len = Buffer.byteLength(payload);
      const packet = Buffer.alloc(8 + len);
      packet.writeInt32LE(op, 0);
      packet.writeInt32LE(len, 4);
      packet.write(payload, 8, len, 'utf8');
      this.socket.write(packet);
    } catch (err) {
      // Ignore transient socket write errors
    }
  }

  setActivity(activity) {
    this.currentActivity = activity;
    if (!this.connected) return;

    const payload = {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity: {
          details: activity.title || 'Listening to Music',
          state: activity.artist ? `by ${activity.artist}` : 'Singularity Player',
          assets: {
            large_image: activity.coverUrl || 'https://raw.githubusercontent.com/takedaa83/Singularity-Player/master/client/public/favicon.svg',
            large_text: activity.album || 'Singularity Player Pro',
            small_image: activity.isPlaying ? 'play_icon' : 'pause_icon',
            small_text: activity.isPlaying ? 'Playing' : 'Paused',
          },
          timestamps: activity.isPlaying && activity.duration ? {
            start: Math.floor(Date.now() - (activity.progress || 0) * 1000),
            end: Math.floor(Date.now() - (activity.progress || 0) * 1000 + (activity.duration || 0) * 1000)
          } : undefined,
          instance: false,
        }
      },
      nonce: Math.random().toString(36).substring(7)
    };

    this.send(1, payload);
  }

  clearActivity() {
    this.currentActivity = null;
    if (!this.connected) return;

    this.send(1, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity: null
      },
      nonce: Math.random().toString(36).substring(7)
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 20000);
  }

  cleanup() {
    this.connected = false;
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.destroy();
      } catch {}
      this.socket = null;
    }
  }

  destroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup();
  }
}

module.exports = { DiscordRpcClient };
