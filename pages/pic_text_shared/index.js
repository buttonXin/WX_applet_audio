import { 
  getTempUrlCompress, 
} from '../../utils/uploadImageUtil.js';

// 在页面中定义激励视频广告
let videoAd = null

Page({
  data: {
    pageTitle: '瓜友分享',
    feedList: [],
    originFeedList: [], // 占位使用
     currentUuid: '', // 存储当前payload的uuid
  },

  onLoad(options) {
    if (!options || !options.payload) return;
    
    if (wx.createRewardedVideoAd) {
      videoAd = wx.createRewardedVideoAd({
        adUnitId: 'adunit-94a52f7929c09dfb'
      })
      videoAd.onLoad(() => {})
      videoAd.onError((err) => {
        console.error('激励视频广告加载失败', err)
      })
      videoAd.onClose((res) => {
        // 用户点击了【关闭广告】按钮
        if (res && res.isEnded) {
          // 正常播放结束，标记当日已解锁
          console.log('正常播放结束，可以下发游戏奖励')
          this.setGlobalUnlockedStatus(true); // 标记解锁
          wx.showToast({ title: '特权到手～'});

          // 显示图片
          this.setData({
            feedList: this.data.originFeedList,
          });

        } else {
          // 播放中途退出，不下发游戏奖励
          console.log('播放中途退出，不下发游戏奖励')
        }
      })
    }
    
    try {
      const payload = JSON.parse(decodeURIComponent(options.payload));
      const initFeedList = payload.feedList || [];

      // 1. 先立即渲染基础数据，让用户先看到页面结构
      this.setData({
        originFeedList: initFeedList,
         currentUuid: payload.uuid // 保存当前uuid
      });

      wx.setNavigationBarTitle({
        title: payload.title || '吃瓜'
      });

      // 2. 异步去加载海报/缩略图 (不阻塞页面展示)
      if (initFeedList.length > 0) {
        this.loadPostersAsync(initFeedList);
      }
      
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '分享数据解析失败', icon: 'none' });
    }
    this.onInitLoad();
  },

  onInitLoad(){
    // 预览前先校验特权（你可以根据实际场景调整触发时机）
    const needShowAd = this.checkNeedShowAd();
    console.log('needShowAd =' +needShowAd)
    if (!needShowAd) {

      this.updateUuidCount();

      // 免费次数/已解锁 → 直接解锁特权
      // wx.showToast({ title: '解锁吃瓜特权成功！', icon: 'success' });
      // 这里添加你的特权逻辑（比如展示完整内容/解锁功能）
      this.setData({
        feedList: this.data.originFeedList
      });
      return;
    }

    // 需要看广告 → 弹广告确认框
    this.onShowADModal();
  },

  // ========== 核心存储逻辑（新增/修改） ==========
  /**
   * 获取当日存储的根Key（按日期隔离）
   */
  getTodayRootKey() {
    const now = new Date();
    const dateStr = now.getFullYear() + 
                    String(now.getMonth() + 1).padStart(2, '0') + 
                    String(now.getDate()).padStart(2, '0');
    return `melon_ad_status_${dateStr}`;
  },

  /**
   * 获取当日完整存储状态
   * @returns {Object} { unlocked: 全局是否解锁, uuidCounts: { [uuid]: 次数 } }
   */
  getTodayStatus() {
    const rootKey = this.getTodayRootKey();
    const defaultStatus = { unlocked: false, uuidCounts: {} };
    try {
      const status = wx.getStorageSync(rootKey) || defaultStatus;
      // 兼容旧数据结构
      return { ...defaultStatus, ...status };
    } catch (err) {
      console.error('读取存储失败', err);
      return defaultStatus;
    }
  },

  /**
   * 更新全局解锁状态
   * @param {Boolean} unlocked 
   */
  setGlobalUnlockedStatus(unlocked) {
    const rootKey = this.getTodayRootKey();
    const status = this.getTodayStatus();
    status.unlocked = unlocked;
    wx.setStorageSync(rootKey, status);
  },

  /**
   * 更新单个uuid的观看次数（相同uuid不重复计数）
   */
  updateUuidCount() {
    const { currentUuid } = this.data;
    if (!currentUuid) return; // 无uuid则不计数

    const rootKey = this.getTodayRootKey();
    const status = this.getTodayStatus();
    
    // 相同uuid：次数不变；新uuid：次数+1
    if (!status.uuidCounts[currentUuid]) {
      status.uuidCounts[currentUuid] = 1;
    }
    // 已存在的uuid不修改次数
    
    wx.setStorageSync(rootKey, status);
  },

  /**
   * 计算当日已访问的不同uuid总数
   * @returns {Number} 不同uuid的数量
   */
  getTotalUniqueUuidCount() {
    const status = this.getTodayStatus();
    return Object.keys(status.uuidCounts).length;
  },

  /**
   * 核心校验：是否需要看广告
   * @returns {Boolean} true-需要；false-不需要
   */
  checkNeedShowAd() {
    const status = this.getTodayStatus();
    
    // 1. 全局已解锁 → 所有uuid无限看，不需要广告
    if (status.unlocked) return false;

    const { currentUuid } = this.data;
    // 2. 无uuid → 按原有规则（前2次免费）
    if (!currentUuid) {
      const total = this.getTotalUniqueUuidCount();
      if (total < 2) {
        this.updateUuidCount();
        return false;
      }
      return true;
    }

    // 3. 有uuid：相同uuid→免费；新uuid→累计次数
    const hasUuid = !!status.uuidCounts[currentUuid];
    if (hasUuid) {
      // 相同uuid：不计数，直接免费
      return false;
    } else {
      // 新uuid：先计数，再判断是否需要广告
      const total = this.getTotalUniqueUuidCount();
      console.log('total =' +total)
      return total > 2; // 前2个不同uuid免费，第3个需要广告
    }
  },


  // ========== 原有方法修改 ==========
  onShowAD(){
    // 用户触发广告后，显示激励视频广告
    if (videoAd) {
      videoAd.show().catch(() => {
        // 失败重试
        videoAd.load()
          .then(() => videoAd.show())
          .catch(err => {
            console.error('激励视频 广告显示失败', err)
          })
      })
    }
  },

  /// 显示弹窗用户确认后 开始播放广播
  onShowADModal(){
    wx.showModal({
      title: '提示',
      content: `只需观看 1 次广告，即可解锁今日吃瓜特权！`,
      confirmText: '观看广告',
      cancelText: '取消',
      success: (modalRes) => {
        if (modalRes.confirm) {
          console.log('用户点击ok');
          this.onShowAD();
        } else if (modalRes.cancel) {
          console.log('用户点击了cancel');
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
   * 核心方法：并发处理缩略图生成
   */
  async loadPostersAsync(list) {
    // 显示导航栏加载动画
    wx.showNavigationBarLoading();

    try {
      // 使用 map + Promise.all 并发处理，而不是 for 循环一个个等
      const updatedList = await Promise.all(list.map(async (item) => {
        // 只处理 media 类型，且有 tempUrl 的数据
        if (item.type === 'media' && item.tempUrl) {
          try {
            const compressedPoster = await getTempUrlCompress(item.tempUrl);
            // 返回更新了 poster 的新对象
            return {
              ...item,
              poster: compressedPoster // 更新海报地址
            };
          } catch (e) {
            console.error('生成缩略图失败', e);
            // 失败了就保持原样
            return item;
          }
        }
        // 不需要处理的项目直接返回
        return item;
      }));

      // 所有图片处理完了，一次性更新页面
      this.setData({
        originFeedList: updatedList
      });
      console.log('缩略图/海报全部加载完毕');

    } catch (err) {
      console.error('批量处理海报失败', err);
    } finally {
      wx.hideNavigationBarLoading();
    }
  },

  // 跳转到上传页面
  onShare() {
    wx.navigateTo({ url: '/pages/image_burn/index' });
  },

  // 预览方法变得非常简单，因为 poster 已经在 onLoad 里准备好了
  onPreviewMedia(e) {

    const { id } = e.currentTarget.dataset;
    const medias = this.data.feedList.filter((item) => item.type === 'media');
    const current = medias.findIndex((item) => item.id === id);
    if (current < 0) return;

    // 直接使用 data 里的数据，不需要再 async map 了
    wx.previewMedia({
      sources: medias.map((item) => ({
        url: item.tempUrl, // 确保这里是高清大图地址
        type: item.mediaType === 'video' ? 'video' : 'image',
        poster: item.poster // 这里直接取这一行代码生效了！
      })),
      current
    });
  }
});