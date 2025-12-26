// pages/text-burn/index.js
// 阅后即焚页面

const MAX_SHARE_COUNT = 100; // 每天最大分享次数

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
    shareText: '',
    maxInputLength: 500, // 可选：最大输入长度
    canShare: false , // 是否能分享
   

    },

    
   // ============ 分享次数管理 ============
  
  // 检查并重置分享次数（跨天重置）
  checkAndResetShareCount() {
    const today = getTodayStr();
    const stored = wx.getStorageSync('shareCountData_burn_text') || {};
    
    // 如果不是今天的数据，重置
    if (stored.date !== today) {
      wx.setStorageSync('shareCountData_burn_text', { date: today, count: 0 });
    }
  },
  
  // 获取今天的分享次数
  getTodayShareCount() {
    const today = getTodayStr();
    const stored = wx.getStorageSync('shareCountData_burn_text') || {};
    
    if (stored.date === today) {
      return stored.count || 0;
    }
    return 0;
  },
  
  // 增加分享次数
  incrementShareCount() {
    const today = getTodayStr();
    const stored = wx.getStorageSync('shareCountData_burn_text') || {};
    
    if (stored.date === today) {
      stored.count = (stored.count || 0) + 1;
    } else {
      stored.date = today;
      stored.count = 1;
    }
    
    wx.setStorageSync('shareCountData_burn_text', stored);
    return stored.count;
  },
  
  // 检查是否可以分享
  canShare() {
    return this.getTodayShareCount() < MAX_SHARE_COUNT;
  },
  // ============ 分享次数管理 end ============

    onLoad(){
      this.setData({ canShare: this.canShare() });

    },

    // 处理输入事件 (可选，用于实时响应)
    handleInput(e) {
      const value = e.detail.value;
      this.setData({ shareText: e.detail.value.trim() });
      // 可以在这里做一些实时校验或处理
      if (!this.canShare()) {
        this.setData({ canShare: false ,shareText:'' });
        wx.showToast({ title: `每天只能分享${MAX_SHARE_COUNT}次`, icon: 'none' });
      }
    },
  
    // 处理失去焦点事件 (可选)
    handleBlur(e) {
      const value = e.detail.value;
      // 可以在这里做提交或保存逻辑
      console.log('输入框失去焦点，内容为:', value);
    },

    // 生成UUID（通用唯一标识符）
    generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        // 随机生成16进制数
        const r = Math.random() * 16 | 0;
        // 固定UUID的版本位和变体位，符合标准
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    },

  onShare : async function() {
    const text = this.data.shareText;
    if (!text) return;
    if(text === 'string'){
      return;
    }

    const uuid = this.generateUUID();
    console.log(uuid); // 输出示例：f47ac10b-58cc-4372-a567-0e02b2c3d479
    this.setData({textID : uuid});

    console.log('start:', Date.now());
    const checkRes = await wx.cloud.callFunction({
      name: 'mediaCheck',
      data: {
        mediaUrl: text,
        mediaType: 3,  // 文字
        uuid: uuid,  // 唯一标识吗
      }
    });
    console.log('检测结果111:' + Date.now(), JSON.stringify(checkRes));
    const newCount = this.incrementShareCount();
    console.log('分享次数:', newCount );
  },

   // 分享回调
   onShareAppMessage(res) {
    const {   textID , shareText , canShare } = this.data;
    console.log("textID 1111=" , JSON.stringify(this.data))
    if(!canShare || !shareText){
      return {
        title: '人类的本质是复读机',
        path: '/pages/record_cloud/index',
        imageUrl: '/assets/share_img.jpg', // 之前生成的图片作为封面
        // desc: '时间: ' + fmtStart(Date.now())
      }; 
    }

    this.setData({ shareText: ''});
   
    const time = '阅后即焚: ' + encodeURIComponent(fmtStart(Date.now()))  ;
    return {
      title: time,
      path: '/pages/friend_text_burn_shared/index?uuid=' + textID + "&text_butn_time=" + time, // 携带多个参数的路径
      imageUrl: '/assets/white.jpg', // 之前生成的图片作为封面
      // desc: '时间: ' + fmtStart(Date.now())
    };
  },

});
