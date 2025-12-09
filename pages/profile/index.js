Page({
  data: { userInfo: {}, storageSize: 0 },
  onShow() { this.updateStorageSize(); },
  onGetProfile() {
    wx.getUserProfile({
      desc: '用于展示头像昵称',
      success: res => this.setData({ userInfo: res.userInfo }),
      fail: () => wx.showToast({ title: '未授权', icon: 'none' })
    });
  },
  updateStorageSize() {
    wx.getStorageInfo({
      success: res => {
        const mb = (res.currentSize / 1024).toFixed(2);
        this.setData({ storageSize: mb });
      }
    });
  },
  onClearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '确认清理所有本地数据？',
      success: res => {
        if (res.confirm) {
          wx.clearStorageSync();
          this.updateStorageSize();
          wx.showToast({ title: '已清理', icon: 'success' });
        }
      }
    });
  },
  onFeedback() { wx.openCustomerServiceConversation({ fail: () => wx.showToast({ title: '请在后台配置客服', icon: 'none' }) }); },
  onContact() { wx.openCustomerServiceConversation({ fail: () => wx.showToast({ title: '请在后台配置客服', icon: 'none' }) }); }
});
