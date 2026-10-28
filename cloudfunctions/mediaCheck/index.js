// cloudfunctions/mediaCheck/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 上传音频后,将音频发送给wx的安全检测中心进行审核.

exports.main = async (event, context) => {
  const { mediaUrl ,mediaType } = event;
  const wxContext = cloud.getWXContext();
  console.log('mediaCheckAsync11:', JSON.stringify(event) )

  // 2 图片审核
  if (mediaType === 2 ){
     try {
       const result = await cloud.openapi.security.mediaCheckAsync({
         mediaUrl: mediaUrl,
         mediaType: 2,  // 1:音频 2:图片
         version: 2,                // 版本号，固定填2
         scene: 2,                  // 场景值：1=资料 2=评论 3=论坛 4=社交日志（按需选）
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
   } else {
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
