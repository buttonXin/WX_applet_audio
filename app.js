// app.js
const INTRO_KEY = 'liveIntroShown';

App({
  onLaunch() {
    console.log('app launch');
  },

  onShow() {
    // 首次打开提示新增「跟读」模式,弹一次后永久记住
    if (wx.getStorageSync(INTRO_KEY)) return;
    // 延迟一下,等首页渲染完成再弹,避免部分机型 showModal 不出现
    setTimeout(() => {
      if (wx.getStorageSync(INTRO_KEY)) return;
      wx.showModal({
        title: '新增「跟读」模式',
        content: '说完一句，自动回放你的声音，可以跟着练发音。建议戴耳机使用。',
        confirmText: '去体验',
        cancelText: '取消',
        success: res => {
          wx.setStorageSync(INTRO_KEY, true);
          if (res.confirm) {
            wx.switchTab({ url: '/pages/live/index' });
          }
        }
      });
    }, 600);
  },

  globalData: {}
});
