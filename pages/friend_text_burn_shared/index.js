Page({
  data: {
    loading: true, // 加载状态
    dataResult: '', // 云函数返回的数据
    errorMsg: '', // 错误提示
    text_butn_time : '', // 发送时间
  },

  onLoad(options) {
    // 1. 接收分享传入的 uuid 参数（分享链接中携带的参数）
    const { uuid , text_butn_time } = options;
    const time = decodeURIComponent(text_butn_time)
    console.log("optuions = ", JSON.stringify(options))
    if (!uuid) {
      this.setData({
        loading: false,
        errorMsg: '未获取到分享的UUID参数'
      });
      return;
    }

    // 2. 调用云函数 friendUpdateBurn
    this.callFriendUpdateBurn(uuid , time);
  },

  // 调用云函数 friendUpdateBurn
  async callFriendUpdateBurn(uuid , time) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'friendUpdateBurn', // 你的云函数名称
        data: {
          uuid: uuid // 传入分享的UUID
        }
      });
      console.log('22222 = ', JSON.stringify(res))
      const result = res.result;
      if (result.success) {
        // 3. 成功：保存云函数返回的数据（假设返回的核心数据在 result.data 中）
        this.setData({
          loading: false,
          dataResult: result.text || '暂无返回数据',
          text_butn_time:  time,
        });
      } else {
        // 云函数调用成功但业务失败
        this.setData({
          loading: false,
          errorMsg: result.msg || '获取分享数据失败'
        });
      }
    } catch (err) {
      // 云函数调用失败（网络/权限等）
      console.error('调用 friendUpdateBurn 失败：', err);
      this.setData({
        loading: false,
        errorMsg: '服务器异常，请稍后重试'
      });
    }
  },

  // 底部按钮：我也分享一个
  handleShare() {
    wx.redirectTo({
      url: '/pages/text_burn/index', // 新页面路径，可携带参数
      success: () => {
        console.log('关闭当前页并跳转到新页面成功');
      },
      fail: (err) => {
        console.error('跳转失败：', err);
      }
    });
  },

  // 生成UUID（复用你之前的方法）
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },



});