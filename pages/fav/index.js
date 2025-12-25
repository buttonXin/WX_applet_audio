const player = wx.createInnerAudioContext();
// player.obeyMuteSwitch = false;
// player.volume = 1; // 增大播放音量
const MAX_SHARE_COUNT = 10; // 每天最大分享次数


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
    list: [] ,
    lastRecord: null,
    maxNameLength: 50, // 名字最大长度
  },

  onShow() { this.refresh(); },
  onUnload() { player.stop(); },

  refresh() {
    const list = wx.getStorageSync('favList') || [];
    this.setData({ list });
  },

  findById(id) { return this.data.list.find(i => String(i.id) === String(id)); },

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
    // ============ 分享次数管理  end ============

    // ============ 更新lastRecord ============
     // 数据增加fileID
  withAduioUpdateIDs(rec , fileID, audioId , openid) {
    const updated = this.withStartText({ ...rec, fileID: fileID , audioId: audioId, openid : openid});
    this.setData({ lastRecord: updated });
  },

  withStartText(rec) {
    const startedAtText = rec.startedAtText || (rec.startedAt ? fmtStart(rec.startedAt) : '--');
    return { ...rec, startedAtText };
  },
  // ============ 更新lastRecord  end ============

  onHide() {
    if (this.player) this.player.pause();
  },

  onPlay(e) {
    const item = this.findById(e.currentTarget.dataset.id);
    if (!item) return;
    player.src = item.path;
    player.play();
  },

  onRename(e) {
    const item = this.findById(e.currentTarget.dataset.id);
    const maxNameLength = this.data.maxNameLength;
    if (!item) return;
    wx.showModal({
      title: '重命名',
      editable: true,
      placeholderText: item.name,
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
          const list = this.data.list.map(i => i.id === item.id ? { ...i, name: newName } : i);
          wx.setStorageSync('favList', list);
          this.setData({ list });
        }
      }
    });
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除收藏',
      content: '确定删除吗？',
      success: res => {
        if (res.confirm) {
          const list = this.data.list.filter(i => i.id !== id);
          wx.setStorageSync('favList', list);
          this.setData({ list });
          player.stop();
        }
      }
    });
  },

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
      // wx.showToast({ title: '已收藏', icon: 'success' });
      console.log("已收藏")
    } else {
      // 场景2：已收藏 → 判断 fileID 是否需要更新
      if (oldItem.fileID && last.fileID) {
        // 场景2.1：新旧记录 fileID 都非空 → 提示无需更新
        // wx.showToast({ title: '已收藏且信息完整，无需重复保存', icon: 'none' });
        console.log("已收藏且信息完整，无需重复保存")
      } else {
        // 场景2.2：旧记录 fileID 为空，新记录非空 → 替换旧记录
        favs.splice(oldItemIndex, 1); // 删除旧记录
        favs.unshift({ ...last, id: last.id }); // 添加新记录
        wx.setStorageSync('favList', favs);
        // wx.showToast({ title: '已更新收藏', icon: 'success' });
        console.log("已更新收藏")
      }
    }
  
    // console.log("最终收藏列表 = ", JSON.stringify(favs));

  },
  
  async onShare(e) {
    const last = this.findById(e.currentTarget.dataset.id);
    if (!last) return;
    
    console.log('last= ' + JSON.stringify(last));
    this.setData({lastRecord : last});
    
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
      
        // 再次保存一下
        this.onSave();
        
        //  审核通过，增加分享次数
        const newCount = this.incrementShareCount();
        console.log('分享次数:', newCount );

        wx.hideLoading();
         // 显示分享菜单
        this.setData({ showShareMenu: true });
      } else {
        // fileID 不为空，执行其他操作
         // 显示分享菜单
        wx.hideLoading();
        this.setData({ showShareMenu: true });
      }

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
    const db = wx.cloud.database();
    const last = this.data.lastRecord;
    
    db.collection('audios').where({
      _id: last.audioId,
      _openid: last.openid
    }).update({
      data: {
        burn : 1 // 更新字段   1表示直接分享 , 2 表示阅后即焚 , 3 表示 用户已读 其他用户无法再读取.
      }
    });
  },
  
  // 阅后即焚 分享
  onBurnReadShare() {
    this.setData({ showShareMenu: false });
    const last = this.data.lastRecord;

    const db = wx.cloud.database();
    
    db.collection('audios').where({
      _id: last.audioId,
      _openid: last.openid
    }).update({
      data: {
        burn : 2 // 更新字段  
      }
    });
  },

   // 分享回调
   onShareAppMessage(res) {
    const {   lastRecord } = this.data;
 
    console.log("分享数据" , JSON.stringify(lastRecord) )

    console.log('分享来源:', res.from); // 'button' 或 'menu'
    console.log('分享目标:', res.target); // 当 from == 'button' 时，包含被点击按钮的信息

    // 获取按钮信息（如果按钮设置了 data-* 属性）
    let shareAction = 'right-top-share';
    if (res.from === 'button' && res.target && res.target.dataset) {
      shareAction = res.target.dataset.action || ''; // 获取 data-action
      console.log("分享按钮的 action:", shareAction);
    }

    // 2. 对参数值编码（处理中文/特殊字符）
    const encodedParams = {
      shareType: encodeURIComponent(shareAction),
      name: encodeURIComponent(lastRecord.name),
      duration: encodeURIComponent(lastRecord.duration),
      startedAtText: encodeURIComponent(lastRecord.startedAtText),
      fileID: encodeURIComponent(lastRecord.fileID),
      audioId: lastRecord.audioId,
      openid: lastRecord.openid,
    };

    let pathIndex = '' ;
    if(shareAction === 'burn'){
      pathIndex = '/pages/friend_shared/index?id=shaerd';
    }else 
    if(shareAction === 'direct'){
      pathIndex = '/pages/friend_shared/index?id=shaerd';
    }else{
      return {
        title: '人类的本质是复读机',
        path: '/pages/record_test_cloud/index', // 携带多个参数的路径
        imageUrl: '/assets/share_img.png',  // 之前生成的图片作为封面
        // desc: '包含多个参数的复读机分享'
      };
    }

    // 3. 拼接分享路径（多个参数用 & 连接） 这里注意回车会导致数据增加
    const sharePath = `${pathIndex}&shareType=${encodedParams.shareType}&audioId=${encodedParams.audioId}&openid=${encodedParams.openid}&name=${encodedParams.name}&duration=${encodedParams.duration}&startedAtText=${encodedParams.startedAtText}&fileID=${encodedParams.fileID}`;

    console.log('分享数据:', sharePath);
    // 4. 返回分享配置
    return {
      title: '人类的本质是复读机',
      path: sharePath, // 携带多个参数的路径
      imageUrl: '/assets/share_img.png',  // 之前生成的图片作为封面
      // desc: '包含多个参数的复读机分享'
    };
  },

});
