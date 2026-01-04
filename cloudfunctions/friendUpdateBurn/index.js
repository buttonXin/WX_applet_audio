// cloudfunctions/updateAudioBurn/index.js
// 初始化云开发
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();


// 封装延迟函数（核心：返回Promise，等待指定毫秒后resolve）
const delay = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

async function checkTextBurn(uuid , operatorOpenid){
  try{
    const res = await db.collection('textBurn').where({
      uuid: uuid,
    }).get();
    // console.log('11111 = ', JSON.stringify(res) + ' , size='+res.data.length)
     // 3. 检查查询结果：找不到则主动抛出错误
     if (res.data.length === 0) {
      // console.log('2222 = ', JSON.stringify(res) + ' , size='+res.data.length)
      return {
        success: false,
        msg: '分享已销毁!',
        code: 1000
      };
    }
    // console.log('3333 = ', JSON.stringify(res) + ' , size='+res.data.length)
    // 4. 提取 text 字段（取第一条匹配数据，uuid 应唯一）
    const targetData = res.data[0];
    const text = targetData.text; // 提取 text 字段
    const docId = targetData._id; // 获取文档 ID，用于删除操作

     // 先将数据备份到 textBurnBackup 集合
    //  await db.collection('textBurnBackup').add({
    //   data: {
    //     ...targetData, // 复制原数据所有字段
    //     backupTime: db.serverDate(), // 新增备份时间字段（可选）
    //     operatorOpenid: operatorOpenid , // 读取者的openid
    //   }
    // });
    // 5. 删除这条数据（根据文档 ID 删除，效率更高）
    await db.collection('textBurn').doc(docId).remove();

    // 6. 返回成功结果（包含提取的 text 字段）
    return {
      success: true,
      text: text, // 返回提取的 text 字段
      message: `uuid: ${uuid} 对应数据已查询并删除成功`
    };


  }catch (err) {
    console.error('修改burn字段失败：', err);
    return {
      success: false,
      msg: '服务器错误',
      error: err.message
    };
  }

}

// 收到的图片处理逻辑
async function checkImageBurn(imageId,shareOpenid ,operatorOpenid ,tryAgain){
  try {
    const res = await db.collection('audios').where({
      _id: imageId,
      // _openid: shareOpenid
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
    const fileID = audioData.fileID

    console.log('审核结果= status =', status + ", burn = " + burn);

    if(burn === 3){
      return {
        success: true,
        msg: '当前分享已被其他用户抢先了',
        code: 1000
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
            _id: imageId, // 音频ID匹配
            // _openid: shareOpenid // 确保是用户A的音频（防止改错他人音频）
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
            code: 201,
            fileID: fileID
          };
        }

      }
      // 正常分享 1 
      return {
        success: true,
        msg: 'success',
        code: 200,
        fileID: fileID
      }
    } else if (status === 'reject') {
      return {
        success: true,
        msg: '内容审核未通过',
        code: 500
      }
    } else {
      if(tryAgain >= 2){
        return {
          success: true,
          msg: '审核中，请稍后再试',
          code: 300
        }
      }
      console.log('开始等待4秒...');
      // 等待4秒（4000毫秒）
      await delay(4000);
      // 4秒后执行的业务逻辑（示例：打印日志，可替换为你的操作）
      console.log('4秒已到，执行延迟方法！');
      return  await checkImageBurn(imageId, shareOpenid , operatorOpenid , tryAgain + 1);
     
    }

  } catch (err) {
    console.error('修改burn字段失败：', err);
    return {
      success: false,
      msg: '服务器错误',
      error: err.message
    };
  }
}

async function checkResult(audioId,shareOpenid ,operatorOpenid ,tryAgain){
  try {
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
        success: true,
        msg: '当前分享已被其他用户抢先了',
        code: 1000
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
      if(tryAgain >= 2){
        return {
          success: true,
          msg: '审核中，请稍后再试',
          code: 300
        }
      }
      console.log('开始等待4秒...');
      // 等待4秒（4000毫秒）
      await delay(4000);
      // 4秒后执行的业务逻辑（示例：打印日志，可替换为你的操作）
      console.log('4秒已到，执行延迟方法！');
      return  await checkResult(audioId,shareOpenid ,operatorOpenid , tryAgain + 1);
     
    }

  } catch (err) {
    console.error('修改burn字段失败：', err);
    return {
      success: false,
      msg: '服务器错误',
      error: err.message
    };
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
    const operatorOpenid = wxContext.OPENID;
    // 1. 获取入参：audioId（音频ID）、shareOpenid（用户A的openid）、operatorOpenid（用户B的openid）
    const { audioId, shareOpenid , uuid ,imageId} = event;
    console.log('云函数更新数据库:', JSON.stringify(event) + " , operatorOpenid="+operatorOpenid)

    if(uuid){
      return  await checkTextBurn(uuid, operatorOpenid);
    }

    if(imageId){
      return  await checkImageBurn(imageId, operatorOpenid);
    }
    
    if (!audioId || !shareOpenid) {
      return {
        success: false,
        msg: '缺少音频ID或分享者ID'
      };
    }
    
    return await checkResult(audioId,shareOpenid ,operatorOpenid , tryAgain = 1);
};
