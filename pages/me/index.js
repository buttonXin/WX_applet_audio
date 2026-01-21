// pages/text-burn/index.js
Page({
  data: {
    rememberMode: false, // 控制开关初始状态，默认为 false
    rememberImageMode: false, // 控制开关初始状态，默认为 false

    // 查看模式选项
    viewModes: [
      { value: '1', label: '音频模式 (默认)' },
      { value: '2', label: '文字模式 (点击打开)' },
      { value: '3', label: '图片模式 (点击打开)' }
    ],
    selectedMode: '1'  // 默认选择第一个

  },

  onLoad() {
    let home_type = wx.getStorageSync('home_type');
    const is_developer = wx.getStorageSync('is_developer') || false;
    if(is_developer){
      this.setData({ viewModes: [
        { value: '1', label: '音频模式 (默认)' },
        { value: '2', label: '文字模式 (点击打开)' },
        { value: '3', label: '图片模式 (点击打开)' },
        { value: '4', label: '图文模式 (点击打开)' }
      ] });
    }
    console.log("home_type ="+home_type);
    if(!home_type){
      home_type = '1';
    }
    console.log("home_type ="+home_type);

    this.setData({
      selectedMode: home_type
    });
    
  },

    // 单选框切换
    onViewModeChange(e) {
      this.setData({
        selectedMode: e.detail.value
      });
      wx.setStorageSync('home_type', e.detail.value);
      console.log('当前选择模式:', e.detail.value);
    },
    
  // 处理 radio-item 的点击事件
  onRadioItemClick(e) {
    const value = e.currentTarget.dataset.value; // 获取 data-value
    const label = e.currentTarget.dataset.label; // 获取 data-label (可选)
    console.log('点击了选项:', label, '值为:', value);
    if(value === '2'){
      // wx.navigateTo({ url: '/pages/text_burn/index' });
      wx.showModal({
        title: '提示',
        content: '文字分享页面暂未开放',
        showCancel: false,
        confirmText: '确认'
      });

    }else if(value === '3'){
      wx.navigateTo({ url: '/pages/image_burn/index' });
    }else if(value === '4'){
      wx.navigateTo({ url: '/pages/pic_text/index' });
    }

  },

  onTextBurnPage(){
    // wx.navigateTo({ url: '/pages/text_burn/index' });
    wx.showModal({
      title: '提示',
      content: '文字分享页面暂未开放',
      showCancel: false,
      confirmText: '确认'
    });
  },

  onImageBurnPage(){
    wx.navigateTo({ url: '/pages/image_burn/index' });
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
      wx.setStorageSync('image_burn', false);
      // 仅可查看一次, 只有第一个用户都可查看, 并且离开页面后, 再也无法查看
      wx.showModal({
        title: '提示',
        content: '文字分享页面, 分享后, 只有第一个用户都可查看, 并且离开页面后, 再也无法查看',
        showCancel: false,
        confirmText: '确认', // 确认按钮文字
        // confirmColor: '#007AFF', // 确认按钮颜色 (可选)
        success(res) {
          // 用户点击确认按钮后的回调
          if (res.confirm) {
            console.log('用户点击了确认');
            // wx.navigateTo({ url: '/pages/text_burn/index' });
            wx.showModal({
              title: '提示',
              content: '文字分享页面暂未开放',
              showCancel: false,
              confirmText: '确认'
            });
          }
        },
      });
     
    } else {
      console.log('用户取消了“记住此模式”');
      // 例如：清除本地存储的记录
      wx.removeStorageSync('text_burn'); // 清除本地存储 (示例)
    }

  },

  /**
   * Switch 状态改变时的回调函数
   * @param {Object} e - 事件对象
   */
  onImageModeSwitchChange(e) {
    const isChecked = e.detail.value; // 获取新的开关状态 (true 或 false)
    console.log('开关状态改变为:', isChecked);

    // 更新页面数据
    this.setData({
      rememberImageMode: isChecked
    });

    // 可以在这里执行其他逻辑
    if (isChecked) {
      console.log('用户选择了“记住此模式”');
      // 例如：保存到全局变量、本地存储 (wx.setStorageSync)、发送请求等
      wx.setStorageSync('image_burn', true); // 保存到本地存储 (示例)
      wx.setStorageSync('text_burn', false); // 保存到本地存储 (示例)
      // 仅可查看一次, 只有第一个用户都可查看, 并且离开页面后, 再也无法查看
      wx.showModal({
        title: '提示',
        content: '默认小程序打开是图片分享页面',
        showCancel: false,
        confirmText: '确认', // 确认按钮文字
        // confirmColor: '#007AFF', // 确认按钮颜色 (可选)
        success(res) {
          // 用户点击确认按钮后的回调
          if (res.confirm) {
            console.log('用户点击了确认');
            wx.navigateTo({ url: '/pages/image_burn/index' });
          }
        },
      });

    } else {
      console.log('用户取消了“记住此模式”');
      // 例如：清除本地存储的记录
      wx.removeStorageSync('image_burn'); // 清除本地存储 (示例)
    }

  },

});
