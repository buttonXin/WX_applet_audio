// cloudfunctions/updateAudioBurn/index.js
// 初始化云开发
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext();
    const operatorOpenid = wxContext.OPENID;
    // 1. 获取入参：audioId（音频ID）、shareOpenid（用户A的openid）、operatorOpenid（用户B的openid）
    const { audioId, shareOpenid } = event;
    console.log('云函数更新数据库:', JSON.stringify(event) + " , operatorOpenid="+operatorOpenid)

    if (!audioId || !shareOpenid) {
      return {
        success: false,
        msg: '缺少音频ID或分享者ID'
      };
    }

    const res = await db.collection('audios').where({
      _id: audioId,
      _openid: shareOpenid
    }).get();

    console.log('审核结果= ', JSON.stringify(res));
    if (res.data.length === 0) {
      return {
        success: false,
        msg: '未找到该音频记录',
      }
    }

    // 3. 正确取值：从数组第一个元素中获取 checkStatus
    const audioData = res.data[0]; // 取匹配的第一条数据
    console.log('审核结果= ', JSON.stringify(audioData));

    const status = audioData.checkStatus; 
    const burn = audioData.burn; 

    console.log('审核结果= status =', status + ", burn = " + burn);

    if(burn === 3){
      return {
        success: false,
        msg: '当前分享已被其他用户抢先了',
      }
    }

    // 4. 审核状态判断
    if (status === 'pass') {
      
      if(burn === 2){
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
            msg: '阅后即焚分享异常'
          };
        }else{

          return {
            success: true,
            msg: '阅后即焚 独占',
            code: 201
          };
        }

      }
      // 正常分享 1 
      return {
        success: true,
        msg: 'success',
        code: 200
      }
    } else if (status === 'reject') {
      return {
        success: true,
        msg: '内容审核未通过',
        code: 500
      }
    } else {
      return {
        success: true,
        msg: '审核中，请稍后再试',
        code: 300
      }
    }

  } catch (err) {
    console.error('修改burn字段失败：', err);
    return {
      success: false,
      msg: '服务器错误',
      error: err.message
    };
  }
};
