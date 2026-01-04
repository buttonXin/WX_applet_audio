// 收到分享的页面

// 定义常量数组
const myStrings = [
  "你是第一个播放的人，内容已被焚毁",
  "音频已被你抢先收听，本次分享结束",
  "你已接收，已触发焚毁机制",
  "你抢先一步，内容仅你可听",
  "手速第一！内容只被你听到了",
  "恭喜，你是唯一听到分享内容的人",
  "恭喜，分享的内容已被你独占",
  // 你已收听，这对音频正在焚毁中
  "你已接收，分享内容正在焚毁中",
  "你已触发阅后即焚，此次分享其他人不可再次播放",
  "已阅后即焚，仅首位收听有效",
  "手速第一！内容只被你听到了",
  "你抢到了，这次分享只属于你"
];

// 获取随机字符串的函数
function getRandomString() {
  const randomIndex = Math.floor(Math.random() * myStrings.length);
  return myStrings[randomIndex];
}
const app = getApp();

Page({
  data: {
    // 初始化时获取一个随机字符串
    displayString: '',
    maxNameLength: 50, // 名字最大长度
    burnList: [], // 本地存储

    // 倒计时相关
    countdown: 0, // 倒计时秒数（5/10）
    showCountdown: false, // 是否显示倒计时
    isDestroyed: false, // 是否已销毁
    timer: null, // 倒计时定时器（用于清除）


    imageId: '', // 图片ID（用于从云端获取）
    imageUrl: '',   // 图片URL
    selectedMode: '',   // 图片的查看模式 在 image_burn 有定义
  },



  onLoad(options) {
    
    console.log("options=",JSON.stringify(options))
    this.setData({ imageId: options.imageId , selectedMode: options.selectedMode});

    if(options.selectedMode === 'all_3s' ||options.selectedMode === 'all_10s' ){
      const result = this.handleImageBurnStorage();
      console.log("result="+ result);
      if(result){
        return;
      }
    }
     // 等待审核
    wx.showLoading({ title: '查询审核结果...', mask: true });
    this.waitForCheckResult(options.imageId);
  },

  /**
   * 处理图片阅后即焚的本地存储逻辑
   */
  handleImageBurnStorage() {
    try {
      // ========== 步骤1：读取本地存储的image_burn_ids ==========
      let burnList = wx.getStorageSync('image_burn_ids') || [];
      // 格式说明：burnList = ["20250720_abc123", "20250719_def456", ...]（年月日_imageId）

      // ========== 步骤2：清理3天前的数据 ==========
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3天前的时间
      const threeDaysAgoStr = this.formatDate(threeDaysAgo); // 转为YYYYMMDD格式

      // 过滤：只保留3天内（含当天）的数据
      burnList = burnList.filter(item => {
        // 拆分出数据的年月日部分（如"20250720_abc123" → "20250720"）
        const itemDateStr = item.split('_')[0] || '';
        // 若数据日期 ≥ 3天前日期，保留；否则删除
        return itemDateStr >= threeDaysAgoStr;
      });

      // ========== 步骤3：判断当前imageId是否已存在（当天数据中） ==========
      const todayStr = this.formatDate(now); // 当天日期（YYYYMMDD）
      const targetKey = `${todayStr}_${this.data.imageId}`; // 组合键：年月日_imageId

      // 检查当天数据中是否包含该imageId
      const isExisted = burnList.some(item => item === targetKey);
      if (isExisted) {
        // ========== 步骤4：更新本地存储（清理后+新增/无新增） ==========
        wx.setStorageSync('image_burn_ids', burnList);
        // 存在：提示无法查看，标记不可查看
        this.goHome("图片已经无法查看");
        return true
      } else {
        // 不存在：新增组合键到列表，标记可查看
        this.setData({ burnList: burnList });
      }
     

    } catch (err) {
      console.error('处理图片本地存储失败：', err);
      wx.showToast({
        title: '数据处理异常',
        icon: 'none'
      });
    }
    return false
  },

  updateBurnList(){
    const now = new Date();
    const todayStr = this.formatDate(now); // 当天日期（YYYYMMDD）
    const targetKey = `${todayStr}_${this.data.imageId}`; // 组合键：年月日_imageId
    const burnList = this.data.burnList;
    burnList.push(targetKey);
    // ========== 步骤4：更新本地存储（清理后+新增/无新增） ==========
    wx.setStorageSync('image_burn_ids', burnList);
  },

  /**
   * 辅助函数：格式化日期为 YYYYMMDD 格式（如20250720）
   * @param {Date} date - 日期对象
   * @returns {String} 格式化后的日期字符串
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份补0
    const day = String(date.getDate()).padStart(2, '0'); // 日期补0
    return `${year}${month}${day}`;
  },
  async waitForCheckResult(imageId ) {

    console.log("imageId= "+imageId);
    wx.showLoading({ title: '处理中...' });

 
    // 调用云函数修改burn字段
    wx.cloud.callFunction({
      name: 'friendUpdateBurn',
      data: {
        imageId:imageId
      }
    }).then(res => {
      this.setData({canShare : false})
      wx.hideLoading();
      if (res.result.success) {
        console.log("uopdate  success" , JSON.stringify(res.result))
        // 已被抢先
        if(res.result.code == 1000){
          this.setData({checkStatus : 'pass'})
            wx.showModal({
              title: '提示',
              content: '当前分享已被其他用户抢先了',
              showCancel: false,
              confirmText: '确认', // 确认按钮文字
              // confirmColor: '#007AFF', // 确认按钮颜色 (可选)
              success(res) {
                // 用户点击确认按钮后的回调
                if (res.confirm) {
                  console.log('用户点击了确认');
                  wx.reLaunch({
                    url: '/pages/image_burn/index', // 替换为你的首页路径
                    success() {
                      console.log('已跳转到首页');
                    },
                    fail(err) {
                      console.error('跳转失败:', err);
                    }
                  });
                }
              },
            });
          return;
        }
        
        // 审核拒绝
        if(res.result.code == 500){
          this.setData({checkStatus : 'reject'})
            wx.showModal({
              title: '提示',
              content: '内容审核未通过',
              confirmText: '确认', // 确认按钮文字
              // confirmColor: '#007AFF', // 确认按钮颜色 (可选)
              success(res) {
                // 用户点击确认按钮后的回调
                if (res.confirm) {
                  console.log('用户点击了确认');
                  wx.reLaunch({
                    url: '/pages/image_burn/index', // 替换为你的首页路径
                    success() {
                      console.log('已跳转到首页');
                    },
                    fail(err) {
                      console.error('跳转失败:', err);
                    }
                  });
                }
              },
            });
          return;
        }
        // 处理审核中
        if(res.result.code == 300){
          this.setData({checkStatus : 'pendding'})
          // 显示包含“去首页”和“重试”按钮的模态框
          wx.showModal({
            title: '提示',
            content: '正在审核中',
            confirmText: '重试',
            cancelText: '去分享',
            success: (modalRes) => {
              if (modalRes.confirm) {
                // 用户点击了“重试”
                console.log('用户点击了重试');
                this.waitForCheckResult(audioId);
              } else if (modalRes.cancel) {
                // 用户点击了“去首页”
                console.log('用户点击了去首页');
                // 跳转到首页
                wx.reLaunch({
                  url: '/pages/image_burn/index', // 替换为你的首页路径
                  success() {
                    console.log('已跳转到首页');
                  },
                  fail(err) {
                    console.error('跳转失败:', err);
                  }
                });
              }
            },
            fail: (err) => {
              console.error('showModal 失败:', err);
              wx.showToast({
                title: '弹窗显示失败',
                icon: 'none'
              });
            }
          });
          return;
        }
        // 阅后即焚 修改完数据库了.
        if(res.result.code == 201){
          this.setData({displayString:getRandomString()});
        }
        // 正常的直接分享, / 阅后即焚, 开始下载音频
        this.downloadAudioFromCloud(res.result.fileID);
      } else {
        console.log("uopdate  fail" , JSON.stringify(res.result))
        wx.showToast({ title: res.result.msg, icon: 'none' });
        this.goHome();
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('调用云函数失败：', err);
      this.goHome();
    });

  },

  goHome(content){
    wx.showModal({
      title: '提示',
      content: content || '操作异常',
      confirmText: '去分享',
      success: (modalRes) => {
        if (modalRes.confirm) {
        
          // 用户点击了“去首页”
          console.log('用户点击了去首页');
          // 跳转到首页
          wx.reLaunch({
            url: '/pages/image_burn/index', // 替换为你的首页路径
            success() {
              console.log('已跳转到首页');
            },
            fail(err) {
              console.error('跳转失败:', err);
            }
          });
        }
      },
      fail: (err) => {
        console.error('showModal 失败:', err);
        wx.showToast({
          title: '弹窗显示失败',
          icon: 'none'
        });
      }
    });
  },

  /**
 * 从云存储下载音频文件（fileID → 临时文件路径）
 * @param {string} fileID 云存储文件ID
 */
  async downloadAudioFromCloud(fileID ) {
    if (!fileID) {
      wx.showToast({ title: '无文件ID', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '下载图片中...' });
    try {
      // 调用云存储下载API
      const res = await wx.cloud.downloadFile({
        fileID: fileID // 分享携带的云存储fileID
      });

      // 下载成功：res.tempFilePath 是音频临时文件路径（可直接播放）
      if (res.statusCode === 200) {
        console.log("audio path = "+ res.tempFilePath)
        this.setData({imageUrl: res.tempFilePath})
        this.initModeLogic();

      }else{
        wx.showToast({ title: '音频下code不是200', icon: 'none' });
      }
    } catch (err) {
      console.error('音频下载失败：', err);
      wx.showToast({ title: '音频下载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
   
   // 预览图片（点击放大）
   previewImage() {
    if (!this.data.imageUrl) return;
    
    this.setData({ showPreview: true });
    // 延迟100ms确保预览层渲染完成，再绘制Canvas
    this.openFullScreenPreview();

  },
 // 打开全屏预览
 openFullScreenPreview() {
  this.setData({ showPreview: true });
},

// 关闭全屏预览
closeFullScreenPreview() {
  this.setData({ showPreview: false });
},

// 拦截图片长按事件（降低保存概率）
onImageLongPress() {
  // wx.showToast({ title: "禁止保存图片", icon: "none" });
},


  // 跳转到上传页面
  goToUpload() {
    wx.navigateTo({ url: '/pages/image_burn/index' });
  },
   /**
   * 初始化不同模式的逻辑
   */
   initModeLogic() {
    const { selectedMode } = this.data;

    // 区分模式：仅5秒/10秒模式启动倒计时
    switch (selectedMode) {
      case 'all_3s':
        this.updateBurnList();
        // 5秒模式：设置倒计时5秒，显示倒计时
        this.setData({
          countdown: 3,
          showCountdown: true
        });
        this.startCountdown(); // 启动倒计时
        break;
      case 'all_10s':
        this.updateBurnList();
        // 10秒模式：设置倒计时10秒，显示倒计时
        this.setData({
          countdown: 10,
          showCountdown: true
        });
        this.startCountdown(); // 启动倒计时
        break;
      case 'all':
        // 所有人可查看：无倒计时，不销毁
        this.setData({
          showCountdown: false,
          isDestroyed: false
        });
        break;
      case 'one_destroy':
        // 仅一人查看后销毁：走你之前的本地存储逻辑（此处复用你原有代码）
        this.setData({
          showCountdown: false
        });
        break;
      default:
        // 未知模式：默认无倒计时
        this.setData({
          showCountdown: false
        });
        break;
    }
  },

    /**
   * 启动倒计时（5/10秒模式）
   */
    startCountdown() {
      // 清除旧定时器（防止重复）
      if (this.data.timer) {
        clearInterval(this.data.timer);
      }
  
      // 创建新定时器：每秒减1
      const timer = setInterval(() => {
        this.setData({
          countdown: this.data.countdown - 1
        }, () => {
          // 倒计时结束：标记销毁，清除定时器，显示提示
          if (this.data.countdown <= 0) {
            clearInterval(timer);
            this.setData({
              isDestroyed: true,
              showCountdown: false,
              timer: null
            });
            this.updateBurnList();
            // 可选：震动/提示用户
            wx.vibrateShort();
          }
        });
      }, 1000);
  
      this.setData({ timer });
    },

      /**
   * 页面卸载：清除定时器（防止内存泄漏）
   */
  onUnload() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
    if(this.data.showCountdown){
      this.setData({
        isDestroyed: true,
        showCountdown: false,
        timer: null
      });
      this.updateBurnList();
    }
  },

  /**
   * 页面隐藏：暂停倒计时（可选，根据业务需求）
   */
  onHide() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
  },

  /**
   * 页面重新显示：恢复倒计时（可选）
   */
  onShow() {
    const { selectedMode, countdown, isDestroyed } = this.data;
    // 仅5/10秒模式、未销毁、倒计时>0时恢复
    if ((selectedMode === 'all_5s' || selectedMode === 'all_10s') && !isDestroyed && countdown > 0) {
      this.startCountdown();
    }
  },

});

