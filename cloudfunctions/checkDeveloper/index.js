// 云函数 index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  // 获取当前用户openid（云函数自动获取，无需前端传）
  const { OPENID } = cloud.getWXContext();
  const { type } = event;

  console.log('云函数更新数据库:', JSON.stringify(event) )

  // 查询白名单
  const res = await db.collection("developer_whitelist").doc("dev_list").get();

  console.log('云函数更新数据库:', JSON.stringify(res) )

  if(type === 1){
    const openSetting = res.data.openSetting;
    return { openSetting };
  }

  // 校验openid是否在白名单内
  const isDeveloper = res.data.openids.includes(OPENID);
  return { isDeveloper };
};