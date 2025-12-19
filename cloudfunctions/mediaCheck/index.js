// cloudfunctions/mediaCheck/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 上传音频后,将音频发送给wx的安全检测中心进行审核.

exports.main = async (event, context) => {
  const { mediaUrl } = event;
  const wxContext = cloud.getWXContext();
  
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
};
