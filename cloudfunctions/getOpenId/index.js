const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 获取用户的openID

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID
  }
}
