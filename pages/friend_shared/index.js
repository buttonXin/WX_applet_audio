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
const recorder = wx.getRecorderManager();
const player = wx.createInnerAudioContext();

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
    timer: null,
    autoStopTimer: null, // 新增：自动停止的定时器
    lastRecord: null,
    startAt: null,
    playing: false,
    userInfo: null,
    // 初始化时获取一个随机字符串
    displayString: '',

    operatorOpenid: '',   // 当前用户的openid
    showBurnButtons: true, //   是否显示底部的按钮
    
    // 分享相关
    shareType: 'right_top',       // 分享类型: direct/textCover/burnRead
    audioId: '' ,          // 分享的音频id ,用于查询
    openid: '' ,  // 用于查询
    checkStatus: 'pendding', // 判断是否已经审核通过
    // 接收相关
    canShare: false   // 控制是否允许分享的开关


  },

  onHide() {
    
    if (this.player) this.player.pause();

    // burn的情况下退出后就不显示 播放按钮了.
    if(!this.data.showBurnButtons){
      this.setData({
        canShare: false // 不显示按钮
      });
    }
  },

  onLoad(options) {
    // 1. 解析参数（注意：微信会自动解码一层，需手动解码编码过的参数）
    // const receivedParams = {
    //   shareType: decodeURIComponent(options.shareType || 'burn'),
    //   audioId: options.audioId || 'ba046a626949177608cb09784672d59c',
    //   openid: options.openid || 'olJSB1y7u_NO6gAM_EQS1HA2SbU8',
    //   name: decodeURIComponent(options.name || '%E5%88%86%E4%BA%AB1'), // 解码中文/特殊字符
    //   duration: decodeURIComponent(options.duration || '5'),
    //   startedAtText: decodeURIComponent(options.startedAtText || '2025-1223-11%3A08'),
    //   fileID: decodeURIComponent(options.fileID || 'cloud%3A%2F%2Fcloud1-7gx2nui6c1ea95dc.636c-cloud1-7gx2nui6c1ea95dc-1391336846%2Faudios%2FolJSB1y7u_NO6gAM_EQS1HA2SbU8_20251222161726.mp3')
    // };
    // console.log('sadasd= ', JSON.stringify(options));
    const receivedParams = {
      shareType: decodeURIComponent(options.shareType || ''),
      audioId: options.audioId || '',
      openid: options.openid || '',
      name: decodeURIComponent(options.name || ''), // 解码中文/特殊字符
      duration: decodeURIComponent(options.duration || ''),
      startedAtText: decodeURIComponent(options.startedAtText || ''),
      fileID: decodeURIComponent(options.fileID || '')
    };

    // 检查 audioId 是否为空
    if (!receivedParams.audioId || receivedParams.audioId.trim() === '') {
      // 显示提示对话框
      wx.showModal({
        title: '提示', // 对话框标题
        content: '当前没有收到分享', // 对话框内容
        showCancel: false, // 不显示取消按钮
        confirmText: '确认', // 确认按钮文字
        // confirmColor: '#007AFF', // 确认按钮颜色 (可选)
        success(res) {
          // 用户点击确认按钮后的回调
          if (res.confirm) {
            console.log('用户点击了确认');
            wx.reLaunch({
              url: '/pages/record_test_cloud/index', // 替换为你的首页路径
              success() {
                console.log('已跳转到首页');
              },
              fail(err) {
                console.error('跳转失败:', err);
              }
            });
          }
        },
        fail(err) {
          console.error('显示模态框失败:', err);
        }
      });
      return;
    } else {
      console.log('接收到的分享类型:', receivedParams.shareType);
    }


    // 2. 打印验证参数（确认接收成功）
    console.log('接收的多个参数：', receivedParams);

    if (receivedParams.shareType === 'burn') {
      this.setData({
        showBurnButtons: false // 不显示按钮
      });
      console.log('shareType 为 burn,隐藏按钮');
    } else {
      this.setData({
        showBurnButtons: true // 显示按钮
      });
      console.log('shareType 不为 burn，显示按钮');
    }

    // 3. 赋值到页面数据，用于渲染
    const lastRecord = this.withStartText({
      id: Date.now(),
      name: receivedParams?.name || '新录音',
      duration: receivedParams.duration,
      path: '',
      startedAtText:receivedParams.startedAtText,
      fileID: receivedParams.fileID,
      audioId: receivedParams.audioId ||'',  // 分享的音频id ,用于查询
      openid: receivedParams.openid ||''     // 用于查询
    });
    this.setData({ lastRecord: lastRecord });

    wx.cloud.callFunction({
      name: 'getOpenId' // 通用获取openid的云函数（需提前创建）
    }).then(res => {
      this.setData({ operatorOpenid: res.result.openid });
      console.log('获取openid = ' + this.data.operatorOpenid);
    });

     // 等待审核
    wx.showLoading({ title: '查询审核结果...', mask: true });
    this.waitForCheckResult(receivedParams.audioId, receivedParams.openid, receivedParams.fileID);

    this.setData({ lastRecord: this.withStartText(lastRecord) ,
       shareType : receivedParams.shareType , audioId: receivedParams.audioId});

    player.onEnded(() => this.setData({ playing: false }));
    player.onStop(() => this.setData({ playing: false }));

  },

  async waitForCheckResult(audioId , shareOpenid ,fileID) {
    const { operatorOpenid } = this.data;
    console.log("audioId= "+audioId+ ", shareOpenid="+shareOpenid+ ", operatorOpenid="+operatorOpenid);
    wx.showLoading({ title: '处理中...' });

    // 调用云函数修改burn字段
    wx.cloud.callFunction({
      name: 'friendUpdateBurn',
      data: {
        audioId,
        shareOpenid,
        operatorOpenid
      }
    }).then(res => {
      this.setData({canShare : false})
      wx.hideLoading();
      if (res.result.success) {
        this.setData({canShare : true})
        console.log("uopdate  success" , JSON.stringify(res.result))
        // 审核拒绝
        if(res.result.code == 500){
          this.setData({checkStatus : 'reject'})
            wx.showModal({
              title: '提示',
              content: '内容审核未通过',
              showCancel: false
            });
          return;
        }
        // 处理审核中
        if(res.result.code == 300){
          this.setData({checkStatus : 'pendding'})
          
            wx.showModal({
              title: '提示',
              content: '审核中，请稍后再试',
              showCancel: false
            });
          return;
        }
        this.setData({checkStatus : 'pass'})
        // 阅后即焚 修改完数据库了.
        if(res.result.code == 201){
          this.setData({displayString:getRandomString()});
        }
        // 正常的直接分享, / 阅后即焚, 开始下载音频
        this.downloadAudioFromCloud(fileID);
      } else {
        console.log("uopdate  fail" , JSON.stringify(res.result))
        wx.showToast({ title: res.result.msg, icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('调用云函数失败：', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    });

  },

  /**
 * 从云存储下载音频文件（fileID → 临时文件路径）
 * @param {string} fileID 云存储文件ID
 */
  async downloadAudioFromCloud(fileID ) {
    if (!fileID) {
      wx.showToast({ title: '无音频文件ID', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '下载音频中...' });
    try {
      // 调用云存储下载API
      const res = await wx.cloud.downloadFile({
        fileID: fileID // 分享携带的云存储fileID
      });

      // 下载成功：res.tempFilePath 是音频临时文件路径（可直接播放）
      if (res.statusCode === 200) {
        console.log("audio path = "+ res.tempFilePath)
        this.withTempAudioPath(this.data.lastRecord , res.tempFilePath);
        wx.showToast({ title: '音频下载成功', icon: 'success' });

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


  withStartText(rec) {
    const startedAtText = rec.startedAtText || (rec.startedAt ? fmtStart(rec.startedAt) : '--');
    return { ...rec, startedAtText };
  },

  // 更新音频路径
  withTempAudioPath(rec , path) {
    const updated = this.withStartText({ ...rec, path: path });
    this.setData({ lastRecord: updated });
  },
    
  stopPlayback() {
    player.stop();
    this.setData({ playing: false });
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

  onStop() {
    this.clearTimer();
    this.clearAutoStopTimer();
    recorder.stop();
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
    const favs = wx.getStorageSync('favList') || [];
    favs.unshift({ ...last, id: Date.now() });
    wx.setStorageSync('favList', favs);
    wx.showToast({ title: '已收藏', icon: 'success' });

    console.log(  "last = " , JSON.stringify(last))
  },


  async onShare() {
    const { shareType, checkStatus } = this.data;
    console.log(  "share shareType="+shareType + ",checkStatus="+checkStatus )
  
  },

   // 分享回调
   onShareAppMessage: function() {
    const { canShare, shareType, audioId, openid, lastRecord } = this.data;
 
    console.log("分享数据" , JSON.stringify(lastRecord) 
    + " , shareType= " + shareType + ", audioId=" + audioId + ", openid=" + openid 
    + ", canShare=" + canShare )

    // 拦截分享（返回空对象则分享面板不会弹出）
    if (!canShare || shareType === 'burn') {
      console.log("111")
      return {
        title: '人类的本质是复读机',
        path: '/pages/record_test_cloud/index', // 携带多个参数的路径
        imageUrl: '/assets/share_img.png',  // 之前生成的图片作为封面
        // desc: '包含多个参数的复读机分享'
      };
      
    }else{
      // 2. 对参数值编码（处理中文/特殊字符）
      const encodedParams = {
        shareType: encodeURIComponent(shareType),
        name: encodeURIComponent(lastRecord.name),
        duration: encodeURIComponent(lastRecord.duration),
        startedAtText: encodeURIComponent(lastRecord.startedAtText),
        fileID: encodeURIComponent(lastRecord.fileID),
        audioId: encodeURIComponent(audioId),
        openid: encodeURIComponent(openid),
      };

      // 3. 拼接分享路径（多个参数用 & 连接）
      const sharePath = `/pages/friend_shared/index?id=shaerd
      &shareType=${encodedParams.shareType}
      &audioId=${encodedParams.audioId}
      &openid=${encodedParams.openid}
      &name=${encodedParams.name}
      &duration=${encodedParams.duration}
      &startedAtText=${encodedParams.startedAtText}
      &fileID=${encodedParams.fileID}`;

      console.log('分享数据:', sharePath);
      // 4. 返回分享配置
      return {
        title: '人类的本质是复读机',
        path: sharePath, // 携带多个参数的路径
        imageUrl: '/assets/share_img.png',  // 之前生成的图片作为封面
        // desc: '包含多个参数的复读机分享'
      };
    }

    return false;
    
  },

});
