// cloudfunctions/mediaCheck/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
// 上传音频后,将音频发送给wx的安全检测中心进行审核.

exports.main = async (event, context) => {
  const { mediaUrl ,mediaType , uuid} = event;
  const wxContext = cloud.getWXContext();
  console.log('mediaCheckAsync11:', JSON.stringify(event) )

  // 3 是文本审核 , 下面的是音频审核
  if(mediaType === 3){
    try {
      const result = await cloud.openapi.security.msgSecCheck({
        content: mediaUrl // 待检测的文本
      });
  
      console.log('检测结果:', JSON.stringify(result) + ', uuid= '+ uuid);
  
      // result 结构包含 errcode, errmsg, and label (敏感词等级)
      if (result.errcode === 0 && result.label !== 0) {
        // 存在敏感信息，errcode 0, label != 0 (例如 label 1: 广告, 2: 政治, 3: 色情等)
        const res = await db.collection('textBurn')
          .where({
            _id: audioId, // 音频ID匹配
            _openid: shareOpenid // 确保是用户A的音频（防止改错他人音频）
          })
          .update({
            data: {
              burn: targetBurn,
              updateTime: db.serverDate(), // 记录修改时间
              operatorOpenid: operatorOpenid // 记录是谁修改的（用户B的openid）
            }
          });

        return {
          success: false,
          message: '内容包含违规信息',
          label: result.label
        };
      } else {
        // 内容安全
        const addRes = await db.collection('textBurn').add({
          data: {
            text: mediaUrl,
            burn: 2,
            uuid: uuid,
            createTime: db.serverDate()
          }
        });
        
        return {
          success: true,
          message: '内容安全'
        };
      }
    } catch (error) {
      console.error('内容安全检测失败:', error);
      return {
        success: false,
        message: '检测服务错误'
      };
    }
  }else{
    try {
      const result = await cloud.openapi.security.mediaCheckAsync({
        mediaUrl: mediaUrl,
        mediaType: 1,  // 1:音频 2:图片
        version: 2,
        scene: 1,
        openid: wxContext.OPENID
      });
      
      return {
        success: true,
        traceId: result.traceId
      };
    } catch (err) {
      console.error('安全检测失败:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }
  
};
