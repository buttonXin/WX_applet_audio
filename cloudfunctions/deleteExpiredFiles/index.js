const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 配置项
const CONFIG = {
  DB_COLLECTION: 'audios',        // 数据库集合名
  FILE_FIELD: 'fileID',           // 存储文件ID的字段名
  LOG_COLLECTION: 'fileDeleteLogs',// 日志集合名
  EXPIRE_HOURS: 24 * 2,               // 过期时间：12小时
  PAGE_SIZE: 20,                  // 分页查询：每次查50条
  BATCH_DELETE_SIZE: 5           // 批量删除：每次删20个
};

// 核心工具函数：校验文件是否存在
async function checkFileExists(fileID) {
  try {
    // 通过getTempFileURL校验文件是否存在（返回有效URL则存在）
    const res = await cloud.getTempFileURL({
      fileList: [fileID]
    });
    // 若fileList[0].code不为空，说明文件不存在/已删除
    return res.fileList[0].code === '';
  } catch (err) {
    console.log(`校验文件${fileID}存在性失败，判定为不存在：`, err.message);
    return false;
  }
}

exports.main = async (event, context) => {
  // 初始化日志
  const logBase = {
    triggerTime: new Date(),
    triggerType: event.triggerName || 'timer',
    expireHours: CONFIG.EXPIRE_HOURS,
    deletedFileIds: [],       // 成功删除的文件ID
    deletedDbByFileNotExist: [], // 因文件不存在删除的数据库记录ID
    deletedCount: 0,          // 删除的文件数量
    deletedDbCount: 0,        // 因文件不存在删除的库记录数量
    status: 'success',
    errorMsg: ''
  };


  try {
    // 1. 计算12小时前的时间戳
    const expireTime = new Date();
    expireTime.setHours(expireTime.getHours() - CONFIG.EXPIRE_HOURS);

    // 2. 分页查询：只取createTime超过12小时的记录（含fileID和数据库_id）
    let expireRecords = []; // 存储完整记录（含_id和fileID）
    let hasMore = true;
    let skip = 0;

    console.log("start = ");
    // while (hasMore && skip < 1000) {
      const dbRes = await db.collection(CONFIG.DB_COLLECTION)
        .where({
          createTime: _.lt(expireTime),
          [CONFIG.FILE_FIELD]: _.exists(true)
        })
        .field({ _id: true, [CONFIG.FILE_FIELD]: true }) // 取数据库_id和fileID
        .limit(CONFIG.PAGE_SIZE)  // 关键修改：只取20条
        .get();

      expireRecords = expireRecords.concat(dbRes.data);
      hasMore = dbRes.data.length === CONFIG.PAGE_SIZE;
      skip += CONFIG.PAGE_SIZE;
    // }
    console.log("expireRecords size = "+ expireRecords.length);

    if (expireRecords.length === 0) {
      logBase.errorMsg = `未查询到超过${CONFIG.EXPIRE_HOURS}小时的记录`;
      await db.collection(CONFIG.LOG_COLLECTION).add({ data: logBase });
      return {
        success: true,
        deletedCount: 0,
        deletedDbCount: 0,
        message: `无超过${CONFIG.EXPIRE_HOURS}小时的记录，日志已记录`
      };
    }
    console.log("2222 = ");

    // 拆分fileID和数据库_id（便于后续操作）
    const fileIds = expireRecords.map(item => item[CONFIG.FILE_FIELD]);
    const recordIdsMap = new Map(); // 映射：fileID → 数据库_id
    expireRecords.forEach(item => {
      recordIdsMap.set(item[CONFIG.FILE_FIELD], item._id);
    });

    // 3. 批量校验文件是否存在
    const validFileIds = [];   // 存在的文件ID（需删文件）
    const invalidFileIds = []; // 不存在的文件ID（需删库记录）

    console.log("33333 = ");
 
    for (let i = 0; i < fileIds.length; i += CONFIG.BATCH_DELETE_SIZE) {
      const batch = fileIds.slice(i, i + CONFIG.BATCH_DELETE_SIZE);
      // 并行校验当前批次的文件
      // const checkResults = await Promise.all(
      //   batch.map(fileID => checkFileExists(fileID))
      // );
      // 筛选有效/无效文件
      batch.forEach((fileID, index) => {
        validFileIds.push(fileID);
      });
    }
    console.log("4444 = ");
    // 4. 处理不存在的文件：直接删除对应的数据库记录
    let deletedDbIds = [];
    if (invalidFileIds.length > 0) {
      // 提取对应的数据库_id
      deletedDbIds = invalidFileIds.map(fileID => recordIdsMap.get(fileID)).filter(id => id);
      // 批量删除数据库记录
      await db.collection(CONFIG.DB_COLLECTION)
        .where({ _id: _.in(deletedDbIds) })
        .remove();
      console.log(`删除${deletedDbIds.length}条因文件不存在的数据库记录：`, deletedDbIds);
    }
    console.log("55555 = ");

    // 5. 处理存在的文件：删除云存储文件 + 删库记录
    const deletedFileIds = [];
    if (validFileIds.length > 0) {
      for (let i = 0; i < validFileIds.length; i += CONFIG.BATCH_DELETE_SIZE) {
        const batch = validFileIds.slice(i, i + CONFIG.BATCH_DELETE_SIZE);
        try {
          await cloud.deleteFile({ fileList: batch });
          deletedFileIds.push(...batch);
          console.log(`批次${Math.floor(i/CONFIG.BATCH_DELETE_SIZE)+1}：删除${batch.length}个过期文件`);
        } catch (err) {
          console.log(`批次${Math.floor(i/CONFIG.BATCH_DELETE_SIZE)+1}删除失败：`, err.message);
        }
      }
      // 删除已成功删文件对应的数据库记录
      if (deletedFileIds.length > 0) {
        const deletedFileDbIds = deletedFileIds.map(fileID => recordIdsMap.get(fileID)).filter(id => id);
        await db.collection(CONFIG.DB_COLLECTION)
          .where({ _id: _.in(deletedFileDbIds) })
          .remove();
      }
    }
    console.log("6666 = ");

    // 6. 更新日志
    logBase.deletedFileIds = deletedFileIds.slice(0, 100);
    logBase.deletedCount = deletedFileIds.length;
    logBase.deletedDbByFileNotExist = deletedDbIds.slice(0, 100); // 记录因文件不存在删的库ID
    logBase.deletedDbCount = deletedDbIds.length;

    // 异步写入日志
    db.collection(CONFIG.LOG_COLLECTION).add({ data: logBase }).catch(err => {
      console.error('日志写入失败：', err);
    });

    return {
      success: true,
      deletedCount: deletedFileIds.length, // 删文件数量
      deletedDbCount: deletedDbIds.length, // 因文件不存在删库的数量
      totalDeletedDb: deletedDbIds.length + deletedFileIds.length, // 总删库数量
      message: `成功删除${deletedFileIds.length}个过期文件，删除${deletedDbIds.length}条文件不存在的数据库记录`
    };

  } catch (err) {
    logBase.status = 'fail';
    logBase.errorMsg = err.message;
    db.collection(CONFIG.LOG_COLLECTION).add({ data: logBase }).catch(e => console.error('错误日志写入失败：', e));

    return {
      success: false,
      error: err.message,
      deletedCount: logBase.deletedCount,
      deletedDbCount: logBase.deletedDbCount,
      message: `操作异常，已删除${logBase.deletedCount}个文件，删除${logBase.deletedDbCount}条无效库记录`
    };
  }
};