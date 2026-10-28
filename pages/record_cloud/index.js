import { applyShareConfig } from '../../utils/shareConfig';

const app = getApp();
const recorder = wx.getRecorderManager();
const player = wx.createInnerAudioContext();

// 将duration改为30000毫秒（30秒）
const MAX_DURATION = 60 * 60 * 1000; // 最大录制时长 4分钟
const MAX_SHARE_COUNT = 5; // 每天最大分享次数

const recOptions = { 
  duration: MAX_DURATION, // 录音最大时长
  sampleRate: 16000, 
  format: 'mp3', 
  encodeBitRate: 96000, 
  numberOfChannels: 1 
};

function fmt(ms) {
  const sec = Math.floor(ms / 1000);
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function fmtStart(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 获取今天的日期字符串 YYYY-MM-DD
function getTodayStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// 生成时间戳精确到秒
function getTimestampStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

Page({
  data: {
    recording: false,
    durationMs: 0,
    durationText: '00:00',
    maxDuration: MAX_DURATION, // 用于页面显示
    timer: null,
    autoStopTimer: null, // 新增：自动停止的定时器
    lastRecord: null,
    startAt: null,
    playing: false,
    userInfo: null,
    maxNameLength: 50, // 名字最大长度

    showShareMenu: false
  },

  onHide() {
    // 防止刚授权时的报错
    if (this.data.recording !== true) {
      return;
    }
    if (this.player) this.player.pause();
  },

  onLoad() {
    applyShareConfig(this);

    const last = wx.getStorageSync('lastRecord');
    const userInfo = wx.getStorageSync('userInfo') || app.globalData?.userInfo || null;
    if (last) this.setData({ lastRecord: this.withStartText(last) });
    if (userInfo) this.setUserInfo(userInfo);
    
    // 检查并重置分享次数（新的一天）
    this.checkAndResetShareCount();

    recorder.onStop(res => {
      // 清除所有定时器
      this.clearTimer();
      this.clearAutoStopTimer();
      
      const prev = this.data.lastRecord;
      const startedAt = this.data.startAt || Date.now();
      const lastRecord = this.withStartText({
        id: Date.now(),
        name: prev?.name || '新录音',
        duration: Math.round(this.data.durationMs / 1000),
        path: res.tempFilePath,
        startedAt,
        fileID: '',
        audioId: '',  // 分享的音频id ,用于查询
        openid: ''     // 用于查询
      });
      wx.setStorageSync('lastRecord', lastRecord);
      this.setData({ 
        recording: false, 
        durationText: fmt(0), 
        durationMs: 0, 
        timer: null, 
        autoStopTimer: null,
        lastRecord, 
        startAt: null ,
      });
    });
    
    recorder.onError(err => {
      this.clearTimer();
      this.clearAutoStopTimer();
      wx.showToast({ title: err.errMsg || '录音失败', icon: 'none' });
    });
    
    player.onEnded(() => this.setData({ playing: false }));
    player.onStop(() => this.setData({ playing: false }));
  },
  
  onShow() {
    if (app.globalData?.userInfo) this.setUserInfo(app.globalData.userInfo);
    // 每次显示页面也检查一下
    this.checkAndResetShareCount();
  },
  
  onUnload() { 
    this.clearTimer(); 
    this.clearAutoStopTimer();
    player.stop(); 
  },

  // ============ 分享次数管理 ============
  
  // 检查并重置分享次数（跨天重置）
  checkAndResetShareCount() {
    const today = getTodayStr();
    const stored = wx.getStorageSync('shareCountData') || {};
    
    // 如果不是今天的数据，重置
    if (stored.date !== today) {
      wx.setStorageSync('shareCountData', { date: today, count: 0 });
    }
  },
  
  // 获取今天的分享次数
  getTodayShareCount() {
    const today = getTodayStr();
    const stored = wx.getStorageSync('shareCountData') || {};
    
    if (stored.date === today) {
      return stored.count || 0;
    }
    return 0;
  },
  
  // 增加分享次数
  incrementShareCount() {
    const today = getTodayStr();
    const stored = wx.getStorageSync('shareCountData') || {};
    
    if (stored.date === today) {
      stored.count = (stored.count || 0) + 1;
    } else {
      stored.date = today;
      stored.count = 1;
    }
    
    wx.setStorageSync('shareCountData', stored);
    return stored.count;
  },
  
  // 检查是否可以分享
  canShare() {
    return this.getTodayShareCount() < MAX_SHARE_COUNT;
  },
  // ============ 分享次数管理 end ============

  withStartText(rec) {
    const startedAtText = rec.startedAtText || (rec.startedAt ? fmtStart(rec.startedAt) : '--');
    return { ...rec, startedAtText };
  },

  // 数据增加fileID
  withAduioUpdateIDs(rec , fileID, audioId , openid) {
    const updated = this.withStartText({ ...rec, fileID: fileID , audioId: audioId, openid : openid});
    wx.setStorageSync('lastRecord', updated);
    this.setData({ lastRecord: updated });
  },

  setUserInfo(info) {
    app.globalData.userInfo = info;
    wx.setStorageSync('userInfo', info);
    this.setData({ userInfo: info });
  },
  
  ensureLogin(cb) {
    if (this.data.userInfo) {
      cb && cb();
      return;
    }
    wx.getUserProfile({
      desc: '用于分享和展示头像昵称',
      success: res => {
        this.setUserInfo(res.userInfo);
        cb && cb();
      },
      fail: () => wx.showToast({ title: '需要授权后才能继续', icon: 'none' })
    });
  },
  
  startTimer() {
    this.clearTimer();
    const timer = setInterval(() => {
      const next = this.data.durationMs + 200;
      
      // 检查是否达到最大时长
      if (next >= MAX_DURATION) {
        this.setData({ durationMs: MAX_DURATION, durationText: fmt(MAX_DURATION) });
        // 达到最大时长，停止录音（由autoStopTimer处理，这里不重复调用）
        return;
      }
      
      this.setData({ durationMs: next, durationText: fmt(next) });
    }, 200);
    this.setData({ timer });
  },
  
  clearTimer() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
    this.setData({ timer: null });
  },
  
  // 新增：设置自动停止定时器
  setAutoStopTimer() {
    this.clearAutoStopTimer();
    const autoStopTimer = setTimeout(() => {
      if (this.data.recording) {
        wx.showToast({ title: '已达到最大录制时长', icon: 'none' });
        this.onStop();
      }
    }, MAX_DURATION);
    this.setData({ autoStopTimer });
  },
  
  // 新增：清除自动停止定时器
  clearAutoStopTimer() {
    if (this.data.autoStopTimer) {
      clearTimeout(this.data.autoStopTimer);
    }
    this.setData({ autoStopTimer: null });
  },
  
  stopPlayback() {
    player.stop();
    this.setData({ playing: false });
  },
  
  onStart() {
    this.stopPlayback();
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ startAt: Date.now() });
        this.startTimer();
        this.setAutoStopTimer(); // 启动自动停止定时器
        recorder.start(recOptions);
        this.setData({ recording: true });
      },
      fail() {
        // 授权失败，引导用户打开设置
        wx.showModal({
          title: '需要录音权限',
          content: '请前往设置开启录音权限，否则无法使用音频录制功能',
          confirmText: '去设置',
          success(res) {
            if (res.confirm) {
              wx.openSetting({
                success(settingRes) {
                  if (settingRes.authSetting['scope.record']) {
                    wx.showToast({ title: '权限已开启', icon: 'success' });
                  }
                }
              });
            }
          }
        });
      }
    });
  },
  
  onStop() {
    this.clearTimer();
    this.clearAutoStopTimer();
    recorder.stop();
  },
  
  onTogglePlay() {
    const last = this.data.lastRecord;
    if (!last) return wx.showToast({ title: '暂无录音', icon: 'none' });
    if (this.data.recording) this.onStop();
    if (this.data.playing) {
      this.stopPlayback();
    } else {
      player.src = last.path;
      player.play();
      this.setData({ playing: true });
    }
  },
  
  onRenameLast() {
    const last = this.data.lastRecord;
    const maxNameLength = this.data.maxNameLength;
    if (!last) return;
    wx.showModal({
      title: '重命名',
      editable: true,
      placeholderText: last.name,
      success: res => {
        if (res.confirm && res.content) {
          let newName = res.content.trim()
          // 限制长度
          if (newName.length > maxNameLength) {
            newName = newName.substring(0, maxNameLength)
            wx.showToast({ 
              title: `名称已截取为${maxNameLength}字`, 
              icon: 'none' 
            })
          }
          const updated = this.withStartText({ ...last, name: newName });
          wx.setStorageSync('lastRecord', updated);
          this.setData({ lastRecord: updated });
        }
      }
    });
  },

  // 长按复制名称
  // onLongPressName() {
  //   const { lastRecord } = this.data
  //   if (!lastRecord || !lastRecord.name) return
  //   wx.setClipboardData({
  //     data: lastRecord.name,
  //     success: () => {
  //       wx.showToast({ title: '已复制', icon: 'success' })
  //     }
  //   })
  // },
  
  onSave() {
    const last = this.data.lastRecord;
    if (!last) return wx.showToast({ title: '先录一段音', icon: 'none' });
  
    let favs = wx.getStorageSync('favList') || [];
  
    // 1. 查找同 id 的旧记录
    const oldItemIndex = favs.findIndex(item => item.id === last.id);
    const oldItem = oldItemIndex > -1 ? favs[oldItemIndex] : null;
  
    // 2. 分场景处理
    if (!oldItem) {
      // 场景1：未收藏过 → 直接添加
      favs.unshift({ ...last, id: last.id });
      wx.setStorageSync('favList', favs);
      wx.showToast({ title: '已收藏', icon: 'success' });
    } else {
      // 场景2：已收藏 → 判断 fileID 是否需要更新
      if (oldItem.fileID && last.fileID) {
        // 场景2.1：新旧记录 fileID 都非空 → 提示无需更新
        wx.showToast({ title: '已收藏且信息完整，无需重复保存', icon: 'none' });
      } else {
        // 场景2.2：旧记录 fileID 为空，新记录非空 → 替换旧记录
        favs.splice(oldItemIndex, 1); // 删除旧记录
        favs.unshift({ ...last, id: last.id }); // 添加新记录
        wx.setStorageSync('favList', favs);
        wx.showToast({ title: '已更新收藏', icon: 'success' });
      }
    }
  
    console.log("最终收藏列表 = ", JSON.stringify(favs));

  },
  
  async onShare() {
    const last = this.data.lastRecord;
    if (!last) return wx.showToast({ title: '先录一段音', icon: 'none' });

    console.log('fileID= ' + last.fileID);
    try{
      // 检查 fileID 是否为空
      if (!last.fileID) {
        // fileID 为空，执行上传操作
        // 检查分享次数
        if (!this.canShare()) {
          return wx.showToast({ title: '每天只能分享10次', icon: 'none' });
        }


        wx.showLoading({ title: '上传中...', mask: true });

        console.log('分享路径 ' + last.path);

        let userId = 'user';
        try {
          const loginRes = await wx.cloud.callFunction({ name: 'getOpenId' });
          userId = loginRes.result.openid || 'user';
        } catch (e) {
          // 获取openid失败，使用默认值
          console.log('获取openid失败，使用默认ID');
        }
        
        //  生成文件名：用户ID + 时间戳（精确到秒）
        const timestamp = getTimestampStr();
        const cloudPath = `audios/${userId}_${timestamp}.mp3`;
        
        console.log('上传路径:', cloudPath);

        const uploadRes = await new Promise((resolve, reject) => {
          wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: last.path,
            success: resolve,
            fail: reject
          });
        });
        console.log('上传成功 fileID = ', uploadRes.fileID);   

       
        // 这里需要重新获取一下才行.
        console.log(  "last = " , JSON.stringify(this.data.lastRecord))

        const audioId = await this.mediaCheckAndSave(uploadRes.fileID, last);
        console.log('audioId:', audioId + " , openid=" + userId);
         // 存一下fileID
        this.withAduioUpdateIDs(last , uploadRes.fileID , audioId, userId);
      
        
        //  审核通过，增加分享次数
        const newCount = this.incrementShareCount();
        console.log('分享次数:', newCount );

        wx.hideLoading();
         // 显示分享菜单
      } else {
        // fileID 不为空，执行其他操作
         // 显示分享菜单
        wx.hideLoading();
      }
      this.setData({ showShareMenu: true });

    } catch (err) {
          console.error('分享失败:', err);
          wx.hideLoading();
          wx.showToast({ 
            title: err.message || '分享失败', 
            icon: 'none' 
          });
        }
        
  },
  
  // 上传音频,并进行审核.
  mediaCheckAndSave: async function(fileID , last) {
   
    try {
      // 1. 上传文件到云存储
       // 2. 获取临时链接用于安全检测
       const urlRes = await wx.cloud.getTempFileURL({
        fileList: [fileID]
      });
      const tempFileURL = urlRes.fileList[0].tempFileURL;
      console.log('tempFileURL:', tempFileURL);

      // 3. 调用安全检测
      const checkRes = await wx.cloud.callFunction({
        name: 'mediaCheck',
        data: {
          mediaUrl: tempFileURL,
          mediaType: 1  // 音频
        }
      });
      if (!checkRes.result.success) {
        throw new Error('安全检测请求失败');
      }
      // 4. 保存到数据库，状态为"审核中"
      const db = wx.cloud.database();
      const addRes = await db.collection('audios').add({
        data: {
          title: last?.name || '我的录音',
          fileID: fileID,
          duration: last?.duration || 0,
          traceId: checkRes.result.traceId,  // 保存追踪ID
          checkStatus: 'pending',             // pending/pass/reject
          createTime: db.serverDate()
        }
      });
      
      wx.showToast({
        title: '上传成功',
        icon: 'success'
      });
      
      return addRes._id;
      
    } catch (err) {
      console.error('上传失败:', err);
      wx.showToast({
        title: '上传失败',
        icon: 'error'
      });
    } finally {
      this.setData({ uploading: false });
    }
  },

   // 隐藏分享菜单
  hideShareMenu() {
    this.setData({ showShareMenu: false });
  },
  
  // 直接分享
  onDirectShare() {
    this.setData({ showShareMenu: false  });
  },

    // 分享回调
  onShareAppMessage(res) {
    return {
      title: '人类的本质是复读机',
      path: '/pages/record_cloud/index',
      imageUrl: '/assets/share_img.jpg',
    };
  },

  toggleLike: function() {
    wx.showToast({
      title: '感谢支持 ❤️',
      icon: 'none',
      duration: 800
    })
    setTimeout(() => {
      const url = 'https://docs.qq.com/doc/DS2hmSHFFY1VKeFJ6';
      wx.setClipboardData({
        data: url,
        success: () => {

          wx.showModal({
            title: '操作指引',
            content: '链接已复制！\n1. 点击微信的搜索\n2. 粘贴链接并访问\n3. 查看完整文档',
            showCancel: false,
            confirmText: '知道了'
          })
        }
      })
    
    }, 500)
  
},
});
