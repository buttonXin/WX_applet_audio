const audio = wx.createInnerAudioContext();

Page({
  data: {
    list: [],
    recordNames: [],
    current: null,
    currentName: '',
    playing: false,
    loop: false,
    speed: 1,
    progress: 0,
    currentTime: '00:00',
    duration: '00:00',
    abMode: false,
    pointA: null,
    pointB: null
  },
  onShow() { this.loadFavs(); },
  onUnload() { audio.stop(); },
  loadFavs() {
    const list = wx.getStorageSync('favList') || [];
    this.setData({ list, recordNames: list.map(i => i.name) });
  },
  onPick(e) {
    const idx = Number(e.detail.value);
    const item = this.data.list[idx];
    if (!item) return;
    this.bindAudio(item);
  },
  bindAudio(item) {
    audio.stop();
    audio.src = item.path;
    audio.loop = this.data.loop;
    audio.playbackRate = this.data.speed;
    audio.onTimeUpdate(() => {
      const dur = audio.duration || 0;
      const cur = audio.currentTime || 0;
      const progress = dur ? Math.min(100, (cur / dur) * 100) : 0;
      this.setData({ currentTime: this.fmt(cur), duration: this.fmt(dur), progress });
      if (this.data.abMode && this.data.pointB && cur >= this.data.pointB) {
        audio.seek(this.data.pointA || 0);
      }
    });
    audio.onEnded(() => this.setData({ playing: false }));
    this.setData({ current: item, currentName: item.name, playing: false, progress: 0, currentTime: '00:00', duration: '00:00' });
  },
  fmt(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
    return `${m}:${s}`;
  },
  onPlay() {
    if (!this.data.current) return wx.showToast({ title: '先选择录音', icon: 'none' });
    if (this.data.playing) {
      audio.pause();
      this.setData({ playing: false });
    } else {
      audio.play();
      this.setData({ playing: true });
    }
  },
  onToggleLoop() {
    const loop = !this.data.loop;
    audio.loop = loop;
    this.setData({ loop });
  },
  onSpeedChange(e) {
    const speed = Number(e.detail.value);
    audio.playbackRate = speed;
    this.setData({ speed });
  },
  onSetAB() {
    const cur = audio.currentTime || 0;
    if (!this.data.pointA) {
      this.setData({ pointA: cur, abMode: false });
      wx.showToast({ title: '已设置 A 点', icon: 'none' });
    } else if (!this.data.pointB) {
      if (cur <= this.data.pointA) return wx.showToast({ title: 'B 点需大于 A 点', icon: 'none' });
      this.setData({ pointB: cur, abMode: true });
      wx.showToast({ title: 'A-B 循环开启', icon: 'none' });
    }
  },
  onClearAB() { this.setData({ pointA: null, pointB: null, abMode: false }); }
});
