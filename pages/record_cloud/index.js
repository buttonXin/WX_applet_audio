const app = getApp();
const recorder = wx.getRecorderManager();
const player = wx.createInnerAudioContext();
const { hasConsent, openAgreement } = require('../../utils/voiceConsent');

// 微信 RecorderManager 单次录音时长上限为 600000ms(10分钟)，超出会导致录音失败
const MAX_DURATION = 10 * 60 * 1000;

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
    autoStopTimer: null,
    lastRecord: null,
    startAt: null,
    playing: false,
    maxNameLength: 50 // 名字最大长度
  },

  onShow() {
    // 从声纹协议页回来且已同意 -> 继续刚才被拦下的录音
    if (this.pendingConsentStart) {
      this.pendingConsentStart = false;
      if (hasConsent()) this.onStart();
      else wx.showToast({ title: '未同意声纹协议，无法录音', icon: 'none' });
    }
  },

  onHide() {
    // 切走页面时自动停止录音,避免后台继续录音
    if (this.data.recording) this.onStop();
    // 防止刚授权时的报错
    if (this.data.playing) {
      player.pause();
      this.setData({ playing: false });
    }
  },

  onLoad() {
    const last = wx.getStorageSync('lastRecord');
    if (last) this.setData({ lastRecord: this.withStartText(last) });

    // 监听器保存引用,卸载时精确移除,避免页面重建后监听器叠加
    this._onRecStop = res => {
      // 清除所有定时器
      this.clearTimer();
      this.clearAutoStopTimer();

      // 录音异常结束（无临时文件或时长过短）时，不生成录音记录
      if (!res || !res.tempFilePath || this.data.durationMs < 1000) {
        this.setData({ recording: false, durationText: fmt(0), durationMs: 0, startAt: null });
        return;
      }

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
    };

    this._onRecError = err => {
      console.error('录音出错:', err);
      this.clearTimer();
      this.clearAutoStopTimer();
      // 只在用户主动录音时提示，避免系统偶发错误在页面打开时弹窗
      if (this.data.recording) {
        this.setData({
          recording: false,
          durationMs: 0,
          durationText: fmt(0),
          startAt: null
        });
        wx.showToast({ title: '录音失败，请重试', icon: 'none' });
      }
    };

    this._onPlayerEnded = () => this.setData({ playing: false });
    this._onPlayerStop = () => this.setData({ playing: false });

    recorder.onStop(this._onRecStop);
    recorder.onError(this._onRecError);
    player.onEnded(this._onPlayerEnded);
    player.onStop(this._onPlayerStop);
  },

  onUnload() {
    this.clearTimer();
    this.clearAutoStopTimer();
    player.stop();
    if (this._onRecStop) recorder.offStop(this._onRecStop);
    if (this._onRecError) recorder.offError(this._onRecError);
    if (this._onPlayerEnded) player.offEnded(this._onPlayerEnded);
    if (this._onPlayerStop) player.offStop(this._onPlayerStop);
  },

  withStartText(rec) {
    const startedAtText = rec.startedAtText || (rec.startedAt ? fmtStart(rec.startedAt) : '--');
    return { ...rec, startedAtText };
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
    // 审核要求:采集声音前必须先取得《声纹授权协议》同意
    if (!hasConsent()) {
      this.pendingConsentStart = true;
      openAgreement();
      return;
    }
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ startAt: Date.now() });
        this.startTimer();
        this.setAutoStopTimer();
        recorder.start(recOptions);
        this.setData({ recording: true });
      },
      fail() {
        // 授权失败，引导用户打开设置
        wx.showModal({
          title: '需要录音权限',
          content: '请前往设置开启录音权限，否则无法使用录音功能',
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
  },

  onStop() {
    this.clearTimer();
    this.clearAutoStopTimer();
    recorder.stop();
  },

  onOpenAgreement() {
    wx.navigateTo({ url: '/pages/agreement/index' });
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
    const maxNameLength = this.data.maxNameLength;
    if (!last) return;
    wx.showModal({
      title: '重命名',
      editable: true,
      placeholderText: last.name,
      success: res => {
        if (res.confirm && res.content) {
          let newName = res.content.trim();
          // 限制长度
          if (newName.length > maxNameLength) {
            newName = newName.substring(0, maxNameLength);
            wx.showToast({
              title: `名称已截取为${maxNameLength}字`,
              icon: 'none'
            });
          }
          const updated = this.withStartText({ ...last, name: newName });
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

    // 1. 查找同 id 的旧记录
    const oldItemIndex = favs.findIndex(item => item.id === last.id);

    // 2. 分场景处理
    if (oldItemIndex === -1) {
      // 未收藏过 → 直接添加
      favs.unshift({ ...last, id: last.id });
      wx.setStorageSync('favList', favs);
      wx.showToast({ title: '已收藏', icon: 'success' });
    } else {
      // 已收藏过 → 用最新录音覆盖名称等信息
      favs.splice(oldItemIndex, 1);
      favs.unshift({ ...last, id: last.id });
      wx.setStorageSync('favList', favs);
      wx.showToast({ title: '已更新收藏', icon: 'success' });
    }
  }
});
