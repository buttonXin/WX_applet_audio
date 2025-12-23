// cloudfunctions/updateAudioBurn/index.js
// 初始化云开发
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    // 1. 获取入参：audioId（音频ID）、shareOpenid（用户A的openid）、operatorOpenid（用户B的openid）
    const { audioId, shareOpenid, operatorOpenid } = event;
    console.log('云函数更新数据库:', JSON.stringify(event))

    if (!audioId || !shareOpenid) {
      return {
        success: false,
        msg: '缺少音频ID或分享者ID'
      };
    }

    // 2. 可选：权限校验（根据业务需求，比如：
    // - 仅允许用户B是用户A的好友（需关联好友表）；
    // - 仅允许特定场景下修改（如分享后72小时内）；
    // - 仅允许修改 burn 字段为指定值（如2）；
    // 示例：仅允许修改 burn 为 3
    const targetBurn = 3;

    // 3. 更新数据库（假设音频表名为：audios）
    const res = await db.collection('audios')
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

    // 4. 判断更新结果
    if (res.stats.updated === 0) {
      return {
        success: false,
        msg: '音频不存在或无修改权限'
      };
    }

    return {
      success: true,
      msg: 'burn字段已修改为3',
      data: res.stats
    };
  } catch (err) {
    console.error('修改burn字段失败：', err);
    return {
      success: false,
      msg: '服务器错误，修改失败',
      error: err.message
    };
  }
};