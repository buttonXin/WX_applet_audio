const recorder = wx.getRecorderManager();
const player = wx.createInnerAudioContext();

const recOptions = { duration: 60000, sampleRate: 16000, format: 'mp3', encodeBitRate: 96000, numberOfChannels: 1 };

function fmt(ms) {
  const sec = Math.floor(ms / 1000);
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

Page({
  data: { recording: false, durationMs: 0, durationText: '00:00', timer: null, lastRecord: null },
  onLoad() {
    const last = wx.getStorageSync('lastRecord');
    if (last) this.setData({ lastRecord: last });
    recorder.onStop(res => {
      const duration = Math.round(this.data.durationMs / 1000);
      const lastRecord = { id: Date.now(), name: last?.name || '新录音', duration, path: res.tempFilePath };
      wx.setStorageSync('lastRecord', lastRecord);
      this.setData({ recording: false, durationText: fmt(0), durationMs: 0, timer: null, lastRecord });
    });
    recorder.onError(err => wx.showToast({ title: err.errMsg || '录音失败', icon: 'none' }));
  },
  onUnload() { this.clearTimer(); },
  startTimer() {
    this.clearTimer();
    const timer = setInterval(() => {
      const next = this.data.durationMs + 200;
      this.setData({ durationMs: next, durationText: fmt(next) });
    }, 200);
    this.setData({ timer });
  },
  clearTimer() {
    if (this.data.timer) clearInterval(this.data.timer);
    this.setData({ timer: null });
  },
  onStart() {
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.startTimer();
        recorder.start(recOptions);
        this.setData({ recording: true });
      },
      fail: () => wx.showToast({ title: '请开启录音权限', icon: 'none' })
    });
  },
  onStop() {
    this.clearTimer();
    recorder.stop();
  },
  onPlayLast() {
    const last = this.data.lastRecord;
    if (!last) return wx.showToast({ title: '暂无录音', icon: 'none' });
    player.src = last.path;
    player.play();
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
          const updated = { ...last, name: res.content };
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
  }
});
