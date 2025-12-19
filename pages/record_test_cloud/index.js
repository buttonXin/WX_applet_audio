const app = getApp();
const recorder = wx.getRecorderManager();
const player = wx.createInnerAudioContext();

// 将duration改为20000毫秒（20秒）
const MAX_DURATION = 20000; // 最大录制时长20秒
const MAX_SHARE_COUNT = 10; // 每天最大分享次数

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

    
    // 分享相关
    shareFileID: null,         // 当前分享的fileID
    shareType: 'direct',       // 分享类型: direct/textCover/burnRead
    shareCoverText: '',        // 文字封面内容
    shareImageUrl: ''          // 分享封面图URL
  },
  
  onLoad() {
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
        fileID: ''
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
  
  withStartText(rec) {
    const startedAtText = rec.startedAtText || (rec.startedAt ? fmtStart(rec.startedAt) : '--');
    return { ...rec, startedAtText };
  },

  // 数据增加fileID
  withAduioFileID(rec , fileID) {
    const updated = this.withStartText({ ...rec, fileID: fileID });
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
      fail: () => wx.showToast({ title: '请开启录音权限', icon: 'none' })
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
    if (!last) return;
    wx.showModal({
      title: '重命名',
      editable: true,
      placeholderText: last.name,
      success: res => {
        if (res.confirm && res.content) {
          const updated = this.withStartText({ ...last, name: res.content });
          wx.setStorageSync('lastRecord', updated);
          this.setData({ lastRecord: updated });
        }
      }
    });
  },
  
  onSave() {
    const last = this.data.lastRecord;
    if (!last) return wx.showToast({ title: '先录一段音', icon: 'none' });
    const favs = wx.getStorageSync('favList') || [];
    favs.unshift({ ...last, id: Date.now() });
    wx.setStorageSync('favList', favs);
    wx.showToast({ title: '已收藏', icon: 'success' });

    console.log(  "last = " , JSON.stringify(last))
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

        this.withAduioFileID(last , uploadRes.fileID);
        // 这里需要重新获取一下才行.
        console.log(  "last = " , JSON.stringify(this.data.lastRecord))

        const audioId = await this.mediaCheckAndSave(uploadRes.fileID, last);
        console.log('audioId:', audioId );
        
        //  审核通过，增加分享次数
        const newCount = this.incrementShareCount();
        console.log('分享次数:', newCount );

        wx.hideLoading();
      } else {
        // fileID 不为空，执行其他操作
        
      }
      // 显示分享菜单
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
        title: '上传成功，审核中, 可先进行分享',
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
  async onDirectShare() {
    this.setData({ showShareMenu: false });
  },
  
  // 文字封面分享
  onTextCoverShare() {
    this.setData({ showShareMenu: false });
    
    wx.navigateTo({
      url: '/pages/text-to-img/index',
      fail: (err) => {
        console.log('跳转分享页失败', err);
        wx.showToast({ title: '分享失败，请重试', icon: 'none' });
      }
    });

    // wx.showModal({
    //   title: '输入封面文字',
    //   editable: true,
    //   placeholderText: '请输入封面文字',
    //   success: async (res) => {
    //     if (res.confirm) {
    //       const text = res.content?.trim() || '我的录音';
    //       this.setData({ shareCoverText: text });
    //       await this.uploadAndShare('textCover', text);
    //     }
    //   }
    // });
  },


  async uploadAndShare(shareType, coverText = '') {
        const last = this.data.lastRecord;
        wx.showLoading({ title: '生成封面...', mask: true });
        const resultImage = await this.generateTextCover(coverText);
        wx.hideLoading();

        // this.setData({
        //   shareFileID: last.fileID,
        //   shareImageUrl: shareImageUrl
        // });
        return resultImage;

  },

    // 分享回调
  onShareAppMessage(res) {
    const {  shareImageUrl, lastRecord } = this.data;

    if (res.from === 'button') {
      console.log(res.target) // 获取触发按钮信息
    }
    const shareData = {
      title:  '人类的本质是复读机-.-',
      path: '/pages/profile/index',
    };
    
    // 如果有自定义封面图
    if (shareImageUrl) {
      shareData.imageUrl = shareImageUrl;
    }
    
    console.log('分享数据:', shareData);
    
    return shareData;
  },

  // 生成文字封面图
  async generateTextCover(text) {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery();
      query.select('#textCoverCanvas')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          if (!res[0]) {
            console.error('Canvas not found');
            resolve('');
            return;
          }
          
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          
          // 设置canvas尺寸（5:4比例，适合分享卡片）
          const dpr = wx.getSystemInfoSync().pixelRatio;
          canvas.width = 500 * dpr;
          canvas.height = 400 * dpr;
          ctx.scale(dpr, dpr);
          
          // 绘制背景渐变
          const gradient = ctx.createLinearGradient(0, 0, 500, 400);
          gradient.addColorStop(0, '#667eea');
          gradient.addColorStop(1, '#764ba2');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, 500, 400);
          
          // 绘制装饰圆圈
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.beginPath();
          ctx.arc(400, 50, 100, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(50, 350, 80, 0, Math.PI * 2);
          ctx.fill();
          
          // 绘制音符图标
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.font = 'bold 60px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🎵', 250, 100);
          
          // 绘制文字
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 36px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // 文字换行处理
          const maxWidth = 400;
          const lineHeight = 50;
          const words = text.split('');
          let line = '';
          let lines = [];
          
          for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i];
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && line !== '') {
              lines.push(line);
              line = words[i];
            } else {
              line = testLine;
            }
          }
          lines.push(line);
          
          // 最多显示3行
          if (lines.length > 3) {
            lines = lines.slice(0, 3);
            lines[2] = lines[2].slice(0, -1) + '...';
          }
          
          // 绘制文字
          const startY = 200 - ((lines.length - 1) * lineHeight) / 2;
          lines.forEach((line, index) => {
            ctx.fillText(line, 250, startY + index * lineHeight);
          });
          
          // 绘制底部提示
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = '24px sans-serif';
          ctx.fillText('点击收听语音', 250, 350);
          
          // 导出图片
          try {
            const tempFilePath = await new Promise((res, rej) => {
              wx.canvasToTempFilePath({
                canvas: canvas,
                success: (result) => res(result.tempFilePath),
                fail: rej
              });
            });
            
            this.setData({ shareImageUrl: tempFilePath});
            
          } catch (err) {
            console.error('生成封面失败:', err);
            resolve('');
          }
        });
    });
  }
});
