const app = getApp();
const recorder = wx.getRecorderManager();
const player = wx.createInnerAudioContext();

// 将duration改为20000毫秒（20秒）
const MAX_DURATION = 20000; // 最大录制时长20秒
const recOptions = { 
  duration: MAX_DURATION, // 录音最大时长
  sampleRate: 16000, 
  format: 'mp3', 
  encodeBitRate: 96000, 
  numberOfChannels: 1 
};

function fmt(ms) {
  const sec = Math.floor(ms / 1000);
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function fmtStart(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    recording: false,
    durationMs: 0,
    durationText: '00:00',
    maxDuration: MAX_DURATION, // 用于页面显示
    timer: null,
    autoStopTimer: null, // 新增：自动停止的定时器
    lastRecord: null,
    startAt: null,
    playing: false,
    userInfo: null
  },
  
  onLoad() {
    const last = wx.getStorageSync('lastRecord');
    const userInfo = wx.getStorageSync('userInfo') || app.globalData?.userInfo || null;
    if (last) this.setData({ lastRecord: this.withStartText(last) });
    if (userInfo) this.setUserInfo(userInfo);
    
    recorder.onStop(res => {
      // 清除所有定时器
      this.clearTimer();
      this.clearAutoStopTimer();
      
      const prev = this.data.lastRecord;
      const startedAt = this.data.startAt || Date.now();
      const lastRecord = this.withStartText({
        id: Date.now(),
        name: prev?.name || '新录音',
        duration: Math.round(this.data.durationMs / 1000),
        path: res.tempFilePath,
        startedAt
      });
      wx.setStorageSync('lastRecord', lastRecord);
      this.setData({ 
        recording: false, 
        durationText: fmt(0), 
        durationMs: 0, 
        timer: null, 
        autoStopTimer: null,
        lastRecord, 
        startAt: null 
      });
    });
    
    recorder.onError(err => {
      this.clearTimer();
      this.clearAutoStopTimer();
      wx.showToast({ title: err.errMsg || '录音失败', icon: 'none' });
    });
    
    player.onEnded(() => this.setData({ playing: false }));
    player.onStop(() => this.setData({ playing: false }));
  },
  
  onShow() {
    if (app.globalData?.userInfo) this.setUserInfo(app.globalData.userInfo);
  },
  
  onUnload() { 
    this.clearTimer(); 
    this.clearAutoStopTimer();
    player.stop(); 
  },
  
  withStartText(rec) {
    const startedAtText = rec.startedAtText || (rec.startedAt ? fmtStart(rec.startedAt) : '--');
    return { ...rec, startedAtText };
  },
  
  setUserInfo(info) {
    app.globalData.userInfo = info;
    wx.setStorageSync('userInfo', info);
    this.setData({ userInfo: info });
  },
  
  ensureLogin(cb) {
    if (this.data.userInfo) {
      cb && cb();
      return;
    }
    wx.getUserProfile({
      desc: '用于分享和展示头像昵称',
      success: res => {
        this.setUserInfo(res.userInfo);
        cb && cb();
      },
      fail: () => wx.showToast({ title: '需要授权后才能继续', icon: 'none' })
    });
  },
  
  startTimer() {
    this.clearTimer();
    const timer = setInterval(() => {
      const next = this.data.durationMs + 200;
      
      // 检查是否达到最大时长
      if (next >= MAX_DURATION) {
        this.setData({ durationMs: MAX_DURATION, durationText: fmt(MAX_DURATION) });
        // 达到最大时长，停止录音（由autoStopTimer处理，这里不重复调用）
        return;
      }
      
      this.setData({ durationMs: next, durationText: fmt(next) });
    }, 200);
    this.setData({ timer });
  },
  
  clearTimer() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
    this.setData({ timer: null });
  },
  
  // 新增：设置自动停止定时器
  setAutoStopTimer() {
    this.clearAutoStopTimer();
    const autoStopTimer = setTimeout(() => {
      if (this.data.recording) {
        wx.showToast({ title: '已达到最大录制时长', icon: 'none' });
        this.onStop();
      }
    }, MAX_DURATION);
    this.setData({ autoStopTimer });
  },
  
  // 新增：清除自动停止定时器
  clearAutoStopTimer() {
    if (this.data.autoStopTimer) {
      clearTimeout(this.data.autoStopTimer);
    }
    this.setData({ autoStopTimer: null });
  },
  
  stopPlayback() {
    player.stop();
    this.setData({ playing: false });
  },
  
  onStart() {
    this.stopPlayback();
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ startAt: Date.now() });
        this.startTimer();
        this.setAutoStopTimer(); // 启动自动停止定时器
        recorder.start(recOptions);
        this.setData({ recording: true });
      },
      fail: () => wx.showToast({ title: '请开启录音权限', icon: 'none' })
    });
  },
  
  onStop() {
    this.clearTimer();
    this.clearAutoStopTimer();
    recorder.stop();
  },
  
  onTogglePlay() {
    const last = this.data.lastRecord;
    if (!last) return wx.showToast({ title: '暂无录音', icon: 'none' });
    if (this.data.recording) this.onStop();
    if (this.data.playing) {
      this.stopPlayback();
    } else {
      player.src = last.path;
      player.play();
      this.setData({ playing: true });
    }
  },
  
  onRenameLast() {
    const last = this.data.lastRecord;
    if (!last) return;
    wx.showModal({
      title: '重命名',
      editable: true,
      placeholderText: last.name,
      success: res => {
        if (res.confirm && res.content) {
          const updated = this.withStartText({ ...last, name: res.content });
          wx.setStorageSync('lastRecord', updated);
          this.setData({ lastRecord: updated });
        }
      }
    });
  },
  
  onSave() {
    const last = this.data.lastRecord;
    if (!last) return wx.showToast({ title: '先录一段音', icon: 'none' });
    const favs = wx.getStorageSync('favList') || [];
    favs.unshift({ ...last, id: Date.now() });
    wx.setStorageSync('favList', favs);
    wx.showToast({ title: '已收藏', icon: 'success' });
  },
  
  onShare() {
    const last = this.data.lastRecord;
    if (!last) return wx.showToast({ title: '先录一段音', icon: 'none' });
    console.log('分享路径 ' + last.path);

    // wx.cloud.init();
    // wx.cloud.uploadFile({
    //   cloudPath: 'my-photo.mp3',
    //   filePath: last.path,
    //   success: res => {
    //     console.log('上传成功', res);
    //   },
    // });
  },
  
  onShareAppMessage() {
    return { title: '分享我的录音', path: '/pages/record/index' };
  }
});
