// app.js
App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 初始化同意状态（本地缓存持久化）
    this.globalData = {
      hasAgreedDisclaimer: wx.getStorageSync("hasAgreedDisclaimer1") || false
    };

    // // 登录
    // wx.login({
    //   success: res => {
    //     // 发送 res.code 到后台换取 openId, sessionKey, unionId
    //   }
    // })

    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-7gx2nui6c1ea95dc',  // 替换为你的云开发环境ID
        traceUser: true
      });
      console.log('cloud init success.')
    }

  },
  globalData: {
    hasAgreedDisclaimer: false // 标记是否同意免责声明
  },
  // 全局方法：显示免责声明弹窗（所有页面可调用）
  showGlobalDisclaimer(that) {
    that.setData({
      showGlobalDisclaimer: true
    });
  },
  // 全局方法：标记同意声明
  agreeDisclaimer() {
    this.globalData.hasAgreedDisclaimer = true;
    wx.setStorageSync("hasAgreedDisclaimer1", true);
  }
})
