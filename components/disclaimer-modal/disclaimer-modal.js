Component({
  properties: {
    showModal: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    // 同意声明
    agreeDisclaimer() {
      // 调用全局方法标记同意
      getApp().agreeDisclaimer();
      // 通知父页面关闭弹窗
      this.triggerEvent("agree");
    },
    // 退出小程序
    exitMiniProgram() {
      wx.exitMiniProgram();
    }
  }
});