// cloudfunctions/mediaCheckCallback/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 后台接收到wx推送的消息后,自动更新数据库

exports.main = async (event, context) => {
  // 1. 验证请求是否来自微信（略，可加 signature 校验）
   // 1. 先打印看看微信推送了什么
  //  console.log('收到推送,完整event:', JSON.stringify(event))

   // 2. 微信推送的字段是小写+下划线格式
   const { 
    ToUserName,
    FromUserName,
    CreateTime,
    MsgType,
    Event,
    appid,
    trace_id,   // 注意是下划线
    version,
    detail,     // 详细结果在这里
    result      // 结果对象
  } = event
  // console.log('Event类型:', Event)
  // console.log('trace_id:', trace_id)
  // console.log('result:', JSON.stringify(result))
  // console.log('detail:', JSON.stringify(detail))

  // 2. 只处理 media_check 事件
  if (Event === 'wxa_media_check') {
    try {
      // result.suggest: "pass" 或 "risky"
      const suggest = result?.suggest || detail?.[0]?.suggest
      const checkStatus = suggest === 'pass' ? 'pass' : 'reject'
      // 3. 根据 TraceId 更新数据库
      await db.collection('audios').where({
        traceId: trace_id
      }).update({
        data: {
          checkStatus: checkStatus,
          checkResult: result,
          updatedAt: db.serverDate()
        }
      })
      console.log('审核结果已更新:', trace_id, result)
    } catch (err) {
      console.error('更新失败:', err)
    }
  }

  // 4. 必须返回 'success'，否则微信会重试
  return 'success'
}