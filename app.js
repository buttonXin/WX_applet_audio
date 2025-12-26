// app.js
App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

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

    const text_burn = wx.getStorageSync('text_burn');
    console.log("text_burn="+text_burn);
    if(text_burn === true){
      wx.navigateTo({ url: '/pages/text_burn/index' });
      // 跳转到指定页面，会关闭当前页面。
      // wx.redirectTo({
      //   url: '/pages/text_burn/index', // 假设这是引导页
      //   success: () => {
      //     console.log('已跳转到引导页');
      //   },
      //   fail: (err) => {
      //     console.error('跳转失败:', err);
      //   }
      // });

    }

  },
  globalData: {
    userInfo: null
  }
})
