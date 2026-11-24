// 跟读:连续录音 -> VAD 判停 -> 自动回放(Step 2)
const recorder = wx.getRecorderManager();
const audio = wx.createInnerAudioContext();
const fs = wx.getFileSystemManager();

const SAMPLE_RATE = 24000; // Hz
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const FRAME_SIZE_KB = 2; // 24kHz 单声道 16bit 下约 43ms 一帧
const MAX_DURATION = 10 * 60 * 1000; // RecorderManager 单次录音上限
const PRE_RESTART_MS = 9.5 * 60 * 1000; // 提前换录音器,避免撞 10 分钟上限
const HEALTH_CHECK_MS = 2000; // 录音帧健康检查间隔
const STALL_MS = 2500; // 超过这个时间没帧视为停摆
const MAX_SEG_MS = 60 * 1000; // 单段上限
const MIN_SPEECH_MS = 200; // 太短的不回放
const SILENCE_KEY = 'liveSilenceMs';
const DEFAULT_SILENCE = 700;
const MODE_KEY = 'liveMode'; // 'headphone' | 'speaker'
const WAIT_KEY = 'liveWaitPlayEnd'; // 播放完再继续听
const MODE_HINT = {
  headphone: '耳机模式:播放时开口自动打断',
  speaker: '外放模式:播放时点「打断」停止,避免回声误触发'
};
const BYTES_PER_MS = (SAMPLE_RATE * (BITS_PER_SAMPLE / 8) * NUM_CHANNELS) / 1000;

let livePage = null;

const STATUS = {
  idle: { text: '待机', hint: '点下方按钮开始', cls: '' },
  recording: { text: '正在听…', hint: '说完停顿会自动回放', cls: 'rec' },
  playing: { text: '正在播放', hint: '播放时可继续说话', cls: 'play' },
  paused: { text: '已暂停', hint: '麦克风被系统占用,恢复后继续', cls: 'paused' }
};

audio.obeyMuteSwitch = false; // iOS 静音键下也能出声

audio.onEnded(() => {
  if (livePage) livePage.onPlayEnd();
});
audio.onError(err => {
  console.error('播放出错', err);
  if (livePage) {
    livePage.setData({ debugText: '播放出错:' + (err && err.errMsg ? err.errMsg : '') });
    livePage.onPlayEnd();
  }
});

recorder.onStart(() => {
  if (livePage) livePage.onRecStart();
});
recorder.onFrameRecorded(res => {
  if (!livePage || !livePage.recActive) return;
  livePage.pushFrame(res.frameBuffer);
});
recorder.onStop(res => {
  if (!livePage) return;
  // 健康检查主动 stop 后自己重启,忽略这次 onStop
  if (livePage.ignoreNextStop) {
    livePage.ignoreNextStop = false;
    return;
  }
  if (!livePage.recActive) return;
  livePage.handleRecStop(res);
});
recorder.onError(err => {
  if (!livePage || !livePage.recActive) return;
  livePage.onRecError(err);
});
// 来电 / 微信语音等系统占用麦克风
recorder.onInterruptionBegin(() => {
  if (livePage) livePage.onInterrupted();
});
recorder.onInterruptionEnd(() => {
  if (livePage) livePage.onInterruptionResume();
});

const TARGET_PEAK = 0.88 * 32767; // 归一化目标峰值
const MAX_GAIN = 4; // 最大放大倍数
const MIN_AUDIBLE_PEAK = 32; // 峰值低于此视为静音,不放大

function buildWavFromChunks(chunks, totalBytes) {
  const merged = new Uint8Array(totalBytes);
  let off = 0;
  for (let i = 0; i < chunks.length; i++) {
    const src = new Uint8Array(chunks[i]);
    merged.set(src, off);
    off += src.byteLength;
  }
  const gain = applyGain(merged, totalBytes);
  return { wav: buildWavFromPcm(merged.buffer, totalBytes), gain };
}

// 峰值归一化:安静录音放大,最大 MAX_GAIN 倍,硬限幅防削波
function applyGain(merged, totalBytes) {
  const len = totalBytes >> 1;
  if (len <= 0) return 1;
  const samples = new Int16Array(merged.buffer, 0, len);
  let maxAbs = 0;
  for (let i = 0; i < len; i++) {
    const a = Math.abs(samples[i]);
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs < MIN_AUDIBLE_PEAK) return 1;
  let gain = TARGET_PEAK / maxAbs;
  if (gain > MAX_GAIN) gain = MAX_GAIN;
  if (gain < 1.02) return 1;
  for (let i = 0; i < len; i++) {
    let v = Math.round(samples[i] * gain);
    if (v > 32767) v = 32767;
    else if (v < -32768) v = -32768;
    samples[i] = v;
  }
  return gain;
}

function buildWavFromPcm(pcmBuffer, totalBytes) {
  let dataLen = totalBytes;
  if (dataLen % 2 !== 0) dataLen -= 1;

  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);
  const writeStr = (o, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  const byteRate = SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, NUM_CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, NUM_CHANNELS * (BITS_PER_SAMPLE / 8), true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);

  const u8 = new Uint8Array(buffer);
  u8.set(new Uint8Array(pcmBuffer).subarray(0, dataLen), 44);
  return buffer;
}

Page({
  data: {
    session: false,
    recording: false,
    playing: false,
    statusText: STATUS.idle.text,
    statusHint: STATUS.idle.hint,
    statusClass: STATUS.idle.cls,
    silenceMs: DEFAULT_SILENCE,
    silenceText: (DEFAULT_SILENCE / 1000).toFixed(1) + ' 秒',
    durationText: '0:00',
    debugText: '准备就绪',
    mode: 'headphone',
    modeHint: MODE_HINT.headphone,
    waitPlayEnd: true,
    settingsOpen: false
  },

  onLoad() {
    livePage = this;

    const saved = Number(wx.getStorageSync(SILENCE_KEY));
    if (saved >= 500 && saved <= 2000) {
      this.setData({ silenceMs: saved, silenceText: (saved / 1000).toFixed(1) + ' 秒' });
    }

    const mode = wx.getStorageSync(MODE_KEY) === 'speaker' ? 'speaker' : 'headphone';
    const waitSaved = wx.getStorageSync(WAIT_KEY);
    const waitPlayEnd = waitSaved === '' || waitSaved === undefined ? true : !!waitSaved;
    this.setData({ mode, modeHint: MODE_HINT[mode], waitPlayEnd });

    this.recActive = false;
    this.pendingStop = false;
    this.frameCount = 0;
    this.segPath = '';
    this.timer = null;
    this.durationMs = 0;
    this.startWatch = null;
    this.stopWatch = null;
    this.playWatch = null;
    this.lastFrameAt = 0;
    this.needRecRestart = false;
    this.preRestartTimer = null;
    this.restartTimer = null;
    this.healthTimer = null;
    this.recBaseFrames = 0;
    this.ignoreNextStop = false;
    this.statusKey = 'idle';
    this.resetVad();
    this.cleanupOldSegs();
  },

  onHide() {
    this.endSession();
  },

  onUnload() {
    this.endSession();
    if (livePage === this) livePage = null;
  },

  onToggle() {
    if (this.data.session) this.stopSession();
    else this.startSession();
  },

  // ---------- 会话 ----------

  startSession() {
    audio.stop();
    this.setData({ playing: false, debugText: '请求麦克风权限…' });
    this.removeSegFile();

    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.frameCount = 0;
        this.needRecRestart = false;
        this.ignoreNextStop = false;
        this.resetVad();
        wx.setKeepScreenOn({ keepScreenOn: true }); // 会话期间不自动息屏
        this.setData({ session: true, recording: true, durationText: '0:00', debugText: '已调用 start,等待录音启动…' });
        this.setStatus('recording');
        this.startTimer();
        this.startRecorder();
        this.startHealth();

        this.startWatch = setTimeout(() => {
          if (this.data.session && this.frameCount === 0) {
            this.setData({ debugText: '1.5s 未收到录音数据(可能格式不被支持)' });
          }
        }, 1500);
      },
      fail: () => {
        this.showRecordPermissionModal();
      }
    });
  },

  startRecorder() {
    this.recActive = true;
    this.lastFrameAt = Date.now();
    this.recBaseFrames = this.frameCount;
    recorder.start({
      duration: MAX_DURATION,
      sampleRate: SAMPLE_RATE,
      numberOfChannels: NUM_CHANNELS,
      format: 'PCM', // frameSize 仅支持 mp3 / pcm
      frameSize: FRAME_SIZE_KB
    });
    // 提前到 9.5 分钟主动换一个录音器,避免撞上 10 分钟硬上限
    clearTimeout(this.preRestartTimer);
    this.preRestartTimer = setTimeout(() => this.preRestart(), PRE_RESTART_MS);
  },

  // 主动换血:等不在说话、不在播放时再停,停完由 handleRecStop 重启
  preRestart() {
    if (!this.data.session) return;
    if (this.vad.speech || this.data.playing) {
      this.preRestartTimer = setTimeout(() => this.preRestart(), 2000);
      return;
    }
    this.setData({ debugText: '录音分段重启中…' });
    recorder.stop();
  },

  stopSession() {
    if (!this.data.session) return;
    this.setData({ session: false, recording: false, playing: false, durationText: '0:00' });
    this.setStatus('idle');
    this.clearTimer();
    clearTimeout(this.playWatch);
    clearTimeout(this.preRestartTimer);
    clearTimeout(this.restartTimer);
    this.stopHealth();
    this.pendingStop = true;
    audio.stop();
    wx.setKeepScreenOn({ keepScreenOn: false });
    this.setData({ debugText: '正在结束…' });
    recorder.stop();

    this.stopWatch = setTimeout(() => {
      if (this.pendingStop) {
        this.pendingStop = false;
        this.recActive = false;
        this.setData({ debugText: `停止事件未返回(帧 ${this.frameCount})` });
      }
    }, 2000);
  },

  endSession() {
    this.clearTimer();
    clearTimeout(this.startWatch);
    clearTimeout(this.stopWatch);
    clearTimeout(this.playWatch);
    clearTimeout(this.preRestartTimer);
    clearTimeout(this.restartTimer);
    this.stopHealth();
    if (this.data.session || this.recActive) {
      this.pendingStop = true;
      this.setData({ session: false });
      this.recActive = false;
      recorder.stop();
    }
    this.pendingStop = false;
    this.frameCount = 0;
    this.needRecRestart = false;
    audio.stop();
    wx.setKeepScreenOn({ keepScreenOn: false });
    this.resetVad();
    this.setData({ session: false, recording: false, playing: false, durationText: '0:00' });
    this.setStatus('idle');
    this.removeSegFile();
  },

  onRecStart() {
    if (!this.recActive) return;
    clearTimeout(this.startWatch);
    this.lastFrameAt = Date.now();
    this.setData({ debugText: '录音已启动,等待帧…' });
  },

  // 来电 / 微信语音等占用麦克风
  onInterrupted() {
    if (!this.data.session) return;
    this.setData({ debugText: '麦克风被系统占用(来电/语音通话),已暂停' });
    this.setStatus('paused');
  },

  onInterruptionResume() {
    if (!this.data.session) return;
    try {
      recorder.resume();
    } catch (e) {
      console.error('恢复录音失败', e);
    }
    this.setStatus('recording');
    this.setData({ debugText: '已恢复录音' });
  },

  // ---------- 帧 + VAD ----------

  resetVad() {
    this.vad = { speech: false, loudRun: 0, silenceMs: 0, speechMs: 0, noiseFloor: 0, frames: 0 };
    this.ring = [];
    this.segChunks = [];
    this.segBytes = 0;
  },

  pushFrame(frameBuffer) {
    if (!this.vad) return;
    this.frameCount += 1;
    this.lastFrameAt = Date.now();

    // 外放模式或“等播放完”开启时,播放中麦克风会录到自己的声音,不参与判停
    if (this.data.playing && (this.data.waitPlayEnd || this.data.mode === 'speaker')) {
      this.pushRing(frameBuffer);
      this.updateDebug();
      return;
    }

    const durMs = frameBuffer.byteLength / BYTES_PER_MS;
    const level = this.frameLevel(frameBuffer);
    const v = this.vad;

    // 前 10 帧(~0.4s)只做噪声底标定
    if (v.frames < 10) {
      v.noiseFloor = v.noiseFloor === 0 ? level : (v.noiseFloor * v.frames + level) / (v.frames + 1);
      v.frames += 1;
      this.pushRing(frameBuffer);
      this.updateDebug();
      return;
    }

    const threshold = Math.max(v.noiseFloor * 2.5, 400);
    const isSpeech = level > threshold;

    if (!v.speech) {
      if (!isSpeech) {
        v.noiseFloor = v.noiseFloor * 0.97 + level * 0.03;
        v.loudRun = 0;
      } else {
        v.loudRun += 1;
      }
      this.pushRing(frameBuffer);
      // 连续 2 帧(~86ms)超过阈值才算开口
      if (isSpeech && v.loudRun >= 2) {
        v.speech = true;
        v.silenceMs = 0;
        v.speechMs = 0;
        // 正在播放则打断
        if (this.data.playing) {
          audio.stop();
          this.setData({ playing: false });
          this.setStatus('recording');
        }
        this.segChunks = this.ring.slice();
        this.segBytes = this.segChunks.reduce((n, b) => n + b.byteLength, 0);
        v.speechMs = (this.segChunks.length - 1) * durMs;
      }
    } else {
      this.pushRing(frameBuffer);
      this.segChunks.push(frameBuffer);
      this.segBytes += frameBuffer.byteLength;
      if (isSpeech) {
        v.silenceMs = 0;
        v.speechMs += durMs;
      } else {
        v.silenceMs += durMs;
      }
      if (v.silenceMs >= this.data.silenceMs || this.segBytes / BYTES_PER_MS >= MAX_SEG_MS) {
        this.finishSegment();
      }
    }
    this.updateDebug();
  },

  frameLevel(buffer) {
    const len = buffer.byteLength >> 1; // 16bit
    if (len <= 0) return 0;
    const view = new DataView(buffer, 0, len * 2);
    let sum = 0;
    for (let i = 0; i < len; i++) {
      const s = view.getInt16(i * 2, true);
      sum += s * s;
    }
    return Math.sqrt(sum / len);
  },

  pushRing(frameBuffer) {
    this.ring.push(frameBuffer);
    if (this.ring.length > 3) this.ring.shift();
  },

  finishSegment() {
    const chunks = this.segChunks;
    const bytes = this.segBytes;
    const speechMs = this.vad.speechMs;
    this.segChunks = [];
    this.segBytes = 0;
    this.vad.speech = false;
    this.vad.loudRun = 0;
    this.vad.silenceMs = 0;
    this.vad.speechMs = 0;

    if (bytes < BYTES_PER_MS * MIN_SPEECH_MS || speechMs < MIN_SPEECH_MS) {
      this.setData({ debugText: `忽略过短片段(${Math.round(speechMs)}ms)` });
      return;
    }
    const result = buildWavFromChunks(chunks, bytes);
    this.saveAndPlay(result.wav, Math.round(bytes / BYTES_PER_MS), result.gain);
  },

  updateDebug() {
    if (this.frameCount % 10 !== 0) return;
    const v = this.vad;
    const state = this.data.playing ? '播放' : v.speech ? '说话' : '聆听';
    this.setData({
      debugText: `帧 ${this.frameCount} | ${state} | 噪声底 ${Math.round(v.noiseFloor)}`
    });
  },

  // ---------- 播放 ----------

  saveAndPlay(wav, segMs, gain) {
    const path = `${wx.env.USER_DATA_PATH}/live_${Date.now()}.wav`;
    fs.writeFile({
      filePath: path,
      data: wav,
      success: () => {
        this.segPath = path;
        const gainText = gain && gain > 1.02 ? `音量 x${gain.toFixed(1)}` : '原始音量';
        this.setData({ debugText: `片段 ${(segMs / 1000).toFixed(1)}s | ${gainText}` });
        this.playSeg();
      },
      fail: err => {
        console.error('写入录音文件失败', err);
        this.setData({ debugText: '写入 WAV 失败:' + (err && err.errMsg ? err.errMsg : '') });
      }
    });
  },

  playSeg() {
    if (!this.segPath) return;
    audio.stop();
    audio.src = this.segPath;
    audio.play();
    this.lastFrameAt = Date.now();
    this.setData({ playing: true });
    this.setStatus('playing');

    // 播放中若 1s 收不到录音帧,说明该机型边录边播被掐断。
    // 只做标记,等播放结束再重启录音器 —— 播放中重启会抢音频会话,反而把回放打断。
    clearTimeout(this.playWatch);
    this.playWatch = setTimeout(() => {
      if (this.data.session && this.data.playing && Date.now() - this.lastFrameAt > 1000) {
        this.needRecRestart = true;
        this.setData({ debugText: '播放时录音停摆,播放结束后自动恢复' });
      }
    }, 1600);
  },

  // 点按打断(两种模式都可用;外放模式是唯一打断方式)
  onInterrupt() {
    if (!this.data.playing) return;
    clearTimeout(this.playWatch);
    audio.stop();
    this.setData({ playing: false, debugText: '已打断' });
    if (this.data.session) this.setStatus('recording');
    this.recoverRecorderIfNeeded();
  },

  onPlayEnd() {
    clearTimeout(this.playWatch);
    this.setData({ playing: false });
    if (this.data.session) this.setStatus('recording');
    else this.setStatus('idle');
    this.recoverRecorderIfNeeded();
  },

  // 播放期间录音停摆过 -> 播放结束后重启录音器(handleRecStop 会在会话中自动重启)
  recoverRecorderIfNeeded() {
    if (!this.needRecRestart) return;
    this.needRecRestart = false;
    if (this.data.session) recorder.stop();
  },

  // ---------- 录音器回调 ----------

  handleRecStop(res) {
    clearTimeout(this.stopWatch);
    clearTimeout(this.preRestartTimer);
    this.pendingStop = false;
    this.recActive = false;

    if (this.data.session) {
      // 自动结束(10 分钟上限 / 主动换血 / 系统中断):稍等再重启,保留 VAD 状态
      this.setData({ debugText: '录音器重启中…' });
      clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        if (this.data.session) this.startRecorder();
      }, 400);
      return;
    }
    // 用户主动结束:丢弃未完成片段
    this.resetVad();
    this.setData({ debugText: '已结束' });
  },

  // 录音帧健康检查:会话中若长时间没有帧,强制恢复录音器
  startHealth() {
    this.stopHealth();
    this.healthTimer = setInterval(() => this.checkHealth(), HEALTH_CHECK_MS);
  },

  stopHealth() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  },

  checkHealth() {
    if (!this.data.session) return;
    if (!this.recActive) return; // 已经有一次重启在排队,别叠加
    if (this.data.playing) return; // 播放期间的停摆由 recoverRecorderIfNeeded 处理
    if (Date.now() - this.lastFrameAt <= STALL_MS) return;

    this.setData({ debugText: '录音中断,正在恢复…' });
    clearTimeout(this.restartTimer);
    clearTimeout(this.preRestartTimer);
    this.recActive = false; // 先断开 onStop 处理,避免和下面的手动重启重复
    this.ignoreNextStop = true;
    recorder.stop();
    setTimeout(() => {
      if (this.data.session) {
        this.startRecorder();
        this.lastFrameAt = Date.now();
        // 防止 onStop 一直没触发导致“忽略标记”残留,吞掉下一次正常停止
        setTimeout(() => { this.ignoreNextStop = false; }, 2000);
      }
    }, 700);
  },

  onRecError(err) {
    console.error('录音出错', err);
    clearTimeout(this.startWatch);
    clearTimeout(this.stopWatch);
    clearTimeout(this.playWatch);
    clearTimeout(this.preRestartTimer);
    clearTimeout(this.restartTimer);
    this.stopHealth();
    this.recActive = false;
    this.pendingStop = false;
    this.clearTimer();
    wx.setKeepScreenOn({ keepScreenOn: false });
    this.setData({
      session: false,
      recording: false,
      playing: false,
      durationText: '0:00',
      debugText: '录音出错:' + (err && err.errMsg ? err.errMsg : JSON.stringify(err))
    });
    this.setStatus('idle');
    wx.showToast({ title: '录音失败，请重试', icon: 'none' });
  },

  // ---------- 其他 ----------

  onSilenceChanging(e) {
    const ms = Number(e.detail.value);
    this.setData({ silenceMs: ms, silenceText: (ms / 1000).toFixed(1) + ' 秒' });
  },

  onSilenceChange(e) {
    const ms = Number(e.detail.value);
    wx.setStorageSync(SILENCE_KEY, ms);
    this.setData({ silenceMs: ms, silenceText: (ms / 1000).toFixed(1) + ' 秒' });
  },

  onModeTap(e) {
    this.setMode(e.currentTarget.dataset.mode);
  },

  onToggleSettings() {
    this.setData({ settingsOpen: !this.data.settingsOpen });
  },

  setMode(mode) {
    if (mode !== 'headphone' && mode !== 'speaker') return;
    wx.setStorageSync(MODE_KEY, mode);
    this.setData({ mode, modeHint: MODE_HINT[mode] });
    if (this.statusKey) this.setStatus(this.statusKey);
  },

  setStatus(key) {
    this.statusKey = key;
    const s = STATUS[key];
    let hint = s.hint;
    if (key === 'playing') {
      if (this.data.waitPlayEnd) hint = '播放结束后自动继续听';
      else if (this.data.mode === 'speaker') hint = '外放模式:点「打断」停止播放';
      else hint = '开口可打断';
    }
    this.setData({ statusText: s.text, statusHint: hint, statusClass: s.cls });
  },

  onWaitChange(e) {
    const v = !!e.detail.value;
    wx.setStorageSync(WAIT_KEY, v);
    this.setData({ waitPlayEnd: v, debugText: `等播放完:${v ? '开' : '关'}` });
    if (this.statusKey) this.setStatus(this.statusKey);
  },

  startTimer() {
    this.clearTimer();
    this.durationMs = 0;
    this.timer = setInterval(() => {
      this.durationMs += 200;
      this.setData({ durationText: this.fmt(this.durationMs) });
    }, 200);
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  fmt(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },

  removeSegFile() {
    if (!this.segPath) return;
    const p = this.segPath;
    this.segPath = '';
    fs.unlink({ filePath: p, fail: () => {} });
  },

  // 小程序被杀 / 闪退时会留下片段文件,进页面时清一遍
  cleanupOldSegs() {
    const dir = wx.env.USER_DATA_PATH;
    fs.readdir({
      dirPath: dir,
      success: res => {
        (res.files || []).forEach(name => {
          if (/^live_\d+\.wav$/i.test(name)) {
            fs.unlink({ filePath: `${dir}/${name}`, fail: () => {} });
          }
        });
      },
      fail: () => {}
    });
  },

  showRecordPermissionModal() {
    wx.showModal({
      title: '需要录音权限',
      content: '请前往设置开启录音权限，否则无法使用跟读功能',
      confirmText: '去设置',
      success(res) {
        if (res.confirm) {
          wx.openSetting({
            success(settingRes) {
              if (settingRes.authSetting['scope.record']) {
                wx.showToast({ title: '权限已开启', icon: 'success' });
              }
            }
          });
        }
      }
    });
  }
});
