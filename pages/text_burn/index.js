// pages/text-burn/index.js
// 阅后即焚页面


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
   

},

    // 处理输入事件 (可选，用于实时响应)
    handleInput(e) {
      const value = e.detail.value;
      this.setData({ shareText: e.detail.value.trim() });
      // 可以在这里做一些实时校验或处理
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

    const uuid = this.generateUUID();
    console.log(uuid); // 输出示例：f47ac10b-58cc-4372-a567-0e02b2c3d479
    this.setData({ shareText: '' , textID : uuid});

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

    // const db = wx.cloud.database();
    // const addRes = await db.collection('textBurn').add({
    //   data: {
    //     text: text,
    //     burn: 2,
    //     createTime: db.serverDate()
    //   }
    // });

    // console.log("textID="+addRes._id)

  

    
  },

   // 分享回调
   onShareAppMessage(res) {
    const {   textID } = this.data;
    console.log("textID 1111="+textID)

    return {
      title: '阅后即焚: ' + fmtStart(Date.now()),
      path: '/pages/friend_text_burn_shared/index?uuid=' + textID, // 携带多个参数的路径
      imageUrl: '/assets/white.jpg', // 之前生成的图片作为封面
      // desc: '时间: ' + fmtStart(Date.now())
    };
  },

});
