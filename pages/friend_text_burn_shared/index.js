Page({
  data: {
    loading: true, // 加载状态
    dataResult: '', // 云函数返回的数据
    errorMsg: '' // 错误提示
  },

  onLoad(options) {
    // 1. 接收分享传入的 uuid 参数（分享链接中携带的参数）
    const { uuid } = options;
    if (!uuid) {
      this.setData({
        loading: false,
        errorMsg: '未获取到分享的UUID参数'
      });
      return;
    }

    // 2. 调用云函数 friendUpdateBurn
    this.callFriendUpdateBurn(uuid);
  },

  // 调用云函数 friendUpdateBurn
  async callFriendUpdateBurn(uuid) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'friendUpdateBurn', // 你的云函数名称
        data: {
          uuid: uuid // 传入分享的UUID
        }
      });

      const result = res.result;
      if (result.success) {
        // 3. 成功：保存云函数返回的数据（假设返回的核心数据在 result.data 中）
        this.setData({
          loading: false,
          dataResult: result.text || '暂无返回数据'
        });
      } else {
        // 云函数调用成功但业务失败
        this.setData({
          loading: false,
          errorMsg: result.errorMessage || '获取分享数据失败'
        });
      }
    } catch (err) {
      // 云函数调用失败（网络/权限等）
      console.error('调用 friendUpdateBurn 失败：', err);
      this.setData({
        loading: false,
        errorMsg: '云函数调用失败，请稍后重试'
      });
    }
  },

  // 底部按钮：我也分享一个
  handleShare() {
    // 1. 先生成本地唯一UUID（复用你之前的UUID生成方法）
    const newUuid = this.generateUUID();

    // 2. 触发小程序分享（可先调用自己的业务接口，再分享）
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });

    // 可选：如果需要自定义分享内容，重写 onShareAppMessage
  },

  // 生成UUID（复用你之前的方法）
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  // 自定义分享内容（点击「我也分享一个」后触发）
  onShareAppMessage() {
    // 生成新的UUID作为分享参数
    const newUuid = this.generateUUID();
    return {
      title: '我分享的专属内容',
      path: `/pages/share-receive/share-receive?uuid=${newUuid}`, // 分享链接携带新UUID
      imageUrl: '/images/share-img.png' // 可选：自定义分享图片
    };
  },

  // 分享到朋友圈（可选）
  onShareTimeline() {
    const newUuid = this.generateUUID();
    return {
      title: '我分享的专属内容',
      query: `uuid=${newUuid}`, // 朋友圈分享携带UUID
      imageUrl: '/images/share-img.png'
    };
  }
});