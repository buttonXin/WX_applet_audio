const player = wx.createInnerAudioContext();
player.obeyMuteSwitch = false;
player.volume = 1; // 增大播放音量

Page({
  data: { list: [] },

  onShow() { this.refresh(); },
  onUnload() { player.stop(); },

  refresh() {
    const list = wx.getStorageSync('favList') || [];
    this.setData({ list });
  },

  findById(id) { return this.data.list.find(i => String(i.id) === String(id)); },

  onPlay(e) {
    const item = this.findById(e.currentTarget.dataset.id);
    if (!item) return;
    player.src = item.path;
    player.play();
  },

  onRename(e) {
    const item = this.findById(e.currentTarget.dataset.id);
    if (!item) return;
    wx.showModal({
      title: '重命名',
      editable: true,
      placeholderText: item.name,
      success: res => {
        if (res.confirm && res.content) {
          const list = this.data.list.map(i => i.id === item.id ? { ...i, name: res.content } : i);
          wx.setStorageSync('favList', list);
          this.setData({ list });
        }
      }
    });
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除收藏',
      content: '确定删除吗？',
      success: res => {
        if (res.confirm) {
          const list = this.data.list.filter(i => i.id !== id);
          wx.setStorageSync('favList', list);
          this.setData({ list });
          player.stop();
        }
      }
    });
  },

  onShare(e) {
    const item = this.findById(e.currentTarget.dataset.id);
    if (!item) return;
    wx.shareAppMessage({
      title: item.name || '我的录音',
      path: '/pages/record/index',
      success: () => wx.showToast({ title: '分享成功', icon: 'success' }),
      fail: err => err && console.error('分享失败', err)
    });
  }
});
