import { 
  getTempUrlCompress, 
} from '../../utils/uploadImageUtil.js';

// 在页面中定义激励视频广告
let videoAd = null
let videoAdSmile = null

Page({
  data: {
    pageTitle: '瓜友分享',
    feedList: [],
    originFeedList: [], // 占位使用
     currentUuid: '', // 存储当前payload的uuid
     showSmileBtn: true, //默认显示开心一刻
     // 自定义弹窗相关
     smileTitle: '开心一刻',
    showCustomModal: false, // 是否显示自定义底部弹窗
    processedText: '', // 处理后的文本
  },

  onLoad(options) {
    if (!options || !options.payload) return;

    // 吃瓜图文广告
    if (wx.createRewardedVideoAd) {
      videoAd = wx.createRewardedVideoAd({
        adUnitId: 'adunit-94a52f7929c09dfb'
      })
      videoAd.onLoad(() => {
       console.log('激励视频广告，onLoad')
      })
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

    // 开心一刻广告
    if (wx.createRewardedVideoAd) {
          videoAdSmile = wx.createRewardedVideoAd({
            adUnitId: 'adunit-1afc7667f02b4124'
          })
          videoAdSmile.onLoad(() => {
           console.log('激励视频广告，onLoad')
          })
          videoAdSmile.onError((err) => {
            console.error('激励视频广告加载失败', err)
          })
          videoAdSmile.onClose((res) => {
            // 用户点击了【关闭广告】按钮
            if (res && res.isEnded) {
              // 正常播放结束，标记当日已解锁
              console.log('正常播放结束，可以下发游戏奖励')
            this.addSmileCount(10);
            wx.showToast({ title: '已增加使用次数～'});
          // 自动触发一次开心一刻
            this.onDaySmile();

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
            wx.showModal({
                  title: '提示',
                  content: `广告加载失败, 是否直接查看?`,
                  confirmText: '确定',
                  cancelText: '取消',
                  success: (modalRes) => {
                    if (modalRes.confirm) {
                      console.log('用户点击ok');
                       this.setData({feedList: this.data.originFeedList});
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
  },

  // ========== 开心一刻次数管理逻辑（新增） ==========
  /**
   * 获取当日开心一刻存储的根Key
   */
  getSmileTodayKey() {
    const now = new Date();
    const dateStr = now.getFullYear() +
                    String(now.getMonth() + 1).padStart(2, '0') +
                    String(now.getDate()).padStart(2, '0');
    return `smile_count_${dateStr}`;
  },

  /**
   * 获取当日开心一刻剩余次数
   * @returns {Object} { remain: 剩余次数, total: 今日总使用次数 }
   */
  getSmileCount() {
    const smileKey = this.getSmileTodayKey();
    const defaultCount = { remain: 5, total: 0 }; // 初始5次免费
    try {
      const count = wx.getStorageSync(smileKey) || defaultCount;
      return { ...defaultCount, ...count };
    } catch (err) {
      console.error('读取开心一刻次数失败', err);
      return defaultCount;
    }
  },

  /**
   * 更新开心一刻次数
   * @param {Number} num 要增加/减少的次数（负数为减少）
   */
  updateSmileCount(num) {
    const smileKey = this.getSmileTodayKey();
    const count = this.getSmileCount();

    // 更新剩余次数和总次数
    count.remain += num;
    count.total = num > 0 ? count.total : count.total + 1; // 只有使用次数时总次数增加

    // 限制剩余次数不超过当前可解锁上限，总次数不超过30
    count.remain = Math.min(count.remain, 30 - count.total);
    count.total = Math.min(count.total, 30);

    wx.setStorageSync(smileKey, count);
  },

  /**
   * 增加开心一刻次数（广告解锁）
   * @param {Number} num 要增加的次数
   */
  addSmileCount(num) {
    this.updateSmileCount(num);
  },

  /**
   * 减少开心一刻次数（使用一次）
   * @returns {Boolean} 是否成功减少（次数足够）
   */
  reduceSmileCount() {
    const count = this.getSmileCount();
    console.log("count=",JSON.stringify(count));
    // 总次数达30次，直接返回失败
    if (count.total >= 30) return false;
    // 剩余次数>0，减少次数
    if (count.remain > 0) {
      this.updateSmileCount(-1);
      return true;
    }
    return false;
  },

  /**
   * 校验开心一刻次数是否可用
   * @returns {Number} 0-可用 1-需看广告 2-今日上限
   */
  checkSmileCountStatus() {
    const count = this.getSmileCount();
    // 总次数达30，返回上限
    if (count.total >= 30) return 2;
    // 剩余次数>0，返回可用
    if (count.remain > 0) return 0;
    // 剩余次数=0且总次数<30，返回需广告
    return 1;
  },

  /**
   * 显示开心一刻广告弹窗
   */
  showSmileAdModal() {
    wx.showModal({
      title: '提示',
      content: '今日开心一刻免费次数已用完，观看广告可增加使用次数',
      confirmText: '观看广告',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.onShowSmileAD();
        }
      }
    });
  },

// 展示开心一刻广告
  onShowSmileAD(){
  // 用户触发广告后，显示激励视频广告
  if (videoAdSmile) {
    videoAdSmile.show().catch(() => {
      // 失败重试
      videoAdSmile.load()
        .then(() => videoAdSmile.show())
        .catch(err => {
          console.error('激励视频 广告显示失败', err)
          wx.showModal({
                title: '提示',
                content: `广告加载失败, 是否直接查看?`,
                confirmText: '确定',
                cancelText: '取消',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    console.log('用户点击ok');


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
        })
    })
  }
},

  /// 开心一刻
  async onDaySmile(){
    // 1. 校验次数状态
      const status = this.checkSmileCountStatus();
      // 状态2：今日上限
      if (status === 2) {
        wx.showToast({ title: '今日开心一刻次数已达上限（30次）', icon: 'none' });
        return;
      }
      // 状态1：需看广告
      if (status === 1) {
        this.showSmileAdModal();
        return;
      }

      // 状态0：次数可用，减少一次
      const canUse = this.reduceSmileCount();
      if (!canUse) {
        wx.showToast({ title: '次数不足，请稍后再试', icon: 'none' });
        return;
      }

    wx.showLoading({ title: '加载中...' }) // 提示用户等待


    try{
     // 1. 定义模式映射
      const modeMap = {
        1: '冷笑话',
        2: '普通笑话',
        3: '浪漫情话',
        4: '土味情话',
        5: '心灵鸡汤'
      }

      // 2. 随机生成模式（或者从event中获取，这里保持随机）
      const randomMode = Math.floor(Math.random() * 5) + 1
      const modeText = modeMap[randomMode]
      // 创建模型
     const model = wx.cloud.extend.AI.createModel("hunyuan-exp");
     const res = await model.generateText({
       model: "hunyuan-turbos-latest",
       messages: [{ role: "user", content: "生成一个开心一刻: " + modeText }],
     });
     console.log("内容=",JSON.stringify(res));
     wx.hideLoading()
    const text = res.choices[0].message.content;
    // 核心：移除所有*号，保留换行
    const processedText = text.replace(/\*/g, '');
    console.log("内容= text = " + processedText);
     // 隐藏按钮
    //  this.setData({ showSmileBtn: false });

     this.setData({processedText, showCustomModal: true , smileTitle: modeText});

    } catch (e) {
      console.error(e);
      wx.hideLoading()
      wx.showToast({ icon: 'none', title: '获取失败' })
    }
  },
  // 关闭自定义弹窗
  closeCustomModal() {
    this.setData({ showCustomModal: false });
  },
});
