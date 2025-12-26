// pages/text-burn/index.js
Page({
  data: {
    rememberMode: false, // 控制开关初始状态，默认为 false
  },

  onLoad() {
    const text_burn = wx.getStorageSync('text_burn');
    console.log("text_burn 2 ="+text_burn);
    if(text_burn === true){
      this.setData({rememberMode: true});
    }else{
      this.setData({rememberMode: false});
    }
  },

  /**
     * Switch 状态改变时的回调函数
     * @param {Object} e - 事件对象
     */
  onModeSwitchChange(e) {
    const isChecked = e.detail.value; // 获取新的开关状态 (true 或 false)
    console.log('开关状态改变为:', isChecked);

    // 更新页面数据
    this.setData({
      rememberMode: isChecked
    });

    // 可以在这里执行其他逻辑
    if (isChecked) {
      console.log('用户选择了“记住此模式”');
      // 例如：保存到全局变量、本地存储 (wx.setStorageSync)、发送请求等
      wx.setStorageSync('text_burn', true); // 保存到本地存储 (示例)
      wx.navigateTo({ url: '/pages/text_burn/index' });
    } else {
      console.log('用户取消了“记住此模式”');
      // 例如：清除本地存储的记录
      wx.removeStorageSync('text_burn'); // 清除本地存储 (示例)
    }

  },

});
