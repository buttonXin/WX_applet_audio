const player = wx.createInnerAudioContext();

Page({
  data: {
    list: [],
    maxNameLength: 50 // 名字最大长度
  },

  onShow() { this.refresh(); },

  onHide() { player.pause(); },

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
    const maxNameLength = this.data.maxNameLength;
    if (!item) return;
    wx.showModal({
      title: '重命名',
      editable: true,
      placeholderText: item.name,
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
          const list = this.data.list.map(i => i.id === item.id ? { ...i, name: newName } : i);
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
  }
});
