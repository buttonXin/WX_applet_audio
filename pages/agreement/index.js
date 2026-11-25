const { grantConsent, hasConsent } = require('../../utils/voiceConsent');

Page({
  data: {
    needConsent: false, // 由录音页跳转过来,需要用户点同意
    agreed: false
  },

  onLoad(query) {
    this.setData({
      needConsent: query && query.consent === '1',
      agreed: hasConsent()
    });
  },

  onAgree() {
    grantConsent();
    wx.showToast({ title: '已同意', icon: 'success', duration: 800 });
    setTimeout(() => wx.navigateBack(), 400);
  },

  onReject() {
    wx.showModal({
      title: '无法使用录音功能',
      content: '不同意本协议,我们将不会调用麦克风,录音、复读、跟读功能都无法使用。',
      showCancel: false,
      confirmText: '知道了',
      success: () => wx.navigateBack()
    });
  }
});
