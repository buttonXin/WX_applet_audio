// 最大图片限制（3M）
const MAX_SIZE = 3 * 1024 * 1024;

// 配置项
const CONFIG = {
  MAX_FILE_COUNT: 20, // 最大选择数量
  MAX_IMAGE_SIZE: 3 * 1024 * 1024, // 3MB
  MAX_VIDEO_SIZE: 30 * 1024 * 1024, // 20MB
  MAX_VIDEO_DURATION: 120, // 120秒
  BATCH_UPLOAD_SIZE: 3, // 批量上传并发数
  COMPRESS_QUALITY: 50, // 压缩质量
  COMPRESS_MAX_WIDTH: 640, // 压缩最大宽度
  COMPRESS_MAX_HEIGHT: 800 // 压缩最大高度
};

/**
 * 批量上传到云存储
 * @param {Array} files 文件列表
 * @param {object} config 配置信息
 */
export async function batchUploadToCloud(files, config = {} , uuid) {
  const { pic_text_total_time } = config;
  
  wx.showLoading({ 
    title: `上传中 (0/${files.length})`, 
    mask: true 
  });

  const results = [];
  const errors = [];

  // 分批上传，避免并发过多
  for (let i = 0; i < files.length; i += CONFIG.BATCH_UPLOAD_SIZE) {
    const batch = files.slice(i, i + CONFIG.BATCH_UPLOAD_SIZE);
    
    try {
      const batchPromises = batch.map((file, index) => 
        uploadSingleFile(file, i + index + 1, files.length, pic_text_total_time ,uuid)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          errors.push({
            index: i + index,
            error: result.reason
          });
        }
      });
      
      // 更新进度
      wx.showLoading({ 
        title: `上传中 (${results.length + errors.length}/${files.length})`, 
        mask: true 
      });
      
    } catch (error) {
      console.error(`批次 ${i / CONFIG.BATCH_UPLOAD_SIZE + 1} 上传失败:`, error);
      errors.push(...batch.map((_, index) => ({
        index: i + index,
        error: error.message
      })));
    }
  }

  wx.hideLoading();

  // 显示上传结果
  showUploadResult(results.length, errors.length);

  return {
    success: results,
    errors: errors,
    total: files.length,
    successCount: results.length,
    errorCount: errors.length
  };
}

/**
 * 上传单个文件
 */
async function uploadSingleFile(file, currentIndex, totalCount, pic_text_total_time , uuid) {
  const fileType = file.fileType;
  const filePath = file.tempFilePath;
  
  // 生成云存储路径
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substr(2, 9);
  const extension = fileType === 'image' ? 'png' : 'mp4';
  const folder = fileType === 'image' ? 'images' : 'videos';
  const cloudPath = `${folder}/${timestamp}-${randomStr}.${extension}`;

  // 上传文件
  const uploadRes = await wx.cloud.uploadFile({
    cloudPath: cloudPath,
    filePath: filePath,
  });

  if (!uploadRes.fileID) {
    throw new Error('上传失败，未获取到fileID');
  }

  // 获取临时链接
  const tempFileURL = await getTempFileURL(uploadRes.fileID, pic_text_total_time);

  return {
    fileID: uploadRes.fileID,
    downUrl: tempFileURL,
    tempFile: file,
    fileType: fileType,
    index: currentIndex - 1, // 原始索引
    cloudPath: cloudPath
  };
}

/**
 * 获取临时文件链接
 */
async function getTempFileURL(fileID, maxAge = 24 * 60 * 60) {
  return new Promise((resolve, reject) => {
    wx.cloud.getTempFileURL({
      fileList: [{
        fileID: fileID,
        maxAge: maxAge || 48 * 60 * 60
      }],
      success: (res) => {
        const tempFileURL = res.fileList[0].tempFileURL;
        resolve(tempFileURL);
      },
      fail: (err) => {
        console.error('获取临时链接失败：', err);
        reject(err);
      }
    });
  });
}

/**
 * 优化后的多文件选择方法
 */
export function chooseMedia(config = {}) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: CONFIG.MAX_FILE_COUNT,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      maxDuration: config.pic_text_video_time || CONFIG.MAX_VIDEO_DURATION,
      success: (res) => {
        console.log(`选择了 ${res.tempFiles.length} 个文件`);
        
        // 验证文件
        const validatedFiles = validateFiles(res.tempFiles, config);
        
        if (validatedFiles.valid.length === 0) {
          wx.showToast({ 
            title: '没有有效的文件可上传', 
            icon: 'none' 
          });
          reject(new Error('没有有效的文件'));
          return;
        }

        // 显示选择结果
        showSelectionResult(validatedFiles);
        
        resolve(validatedFiles);
      },
      fail: (err) => {
        console.log('选择文件失败', err);
        reject(err);
      }
    });
  });
}

/**
 * 验证文件列表
 */
function validateFiles(files, config) {
  const validFiles = [];
  const invalidFiles = [];

  files.forEach((file, index) => {
    const validation = validateSingleFile(file, config);
    
    if (validation.isValid) {
      validFiles.push({
        ...file,
        originalIndex: index,
        validation: validation
      });
    } else {
      invalidFiles.push({
        ...file,
        originalIndex: index,
        error: validation.error
      });
    }
  });

  return {
    valid: validFiles,
    invalid: invalidFiles,
    total: files.length
  };
}

/**
 * 验证单个文件
 */
function validateSingleFile(file, config) {
  const fileType = file.fileType;
  const size = file.size;
  const duration = file.duration || 0;

  // 图片验证
  if (fileType === 'image') {
    if (isGifFile(file.tempFilePath)) {
      return { isValid: false, error: '不支持GIF图片' };
    }
    
    const maxSize = config.maxImageSize || CONFIG.MAX_IMAGE_SIZE;
    if (size > maxSize) {
      const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
      return { 
        isValid: false, 
        error: `图片不能超过${maxSizeMB}M` 
      };
    }
  }
  
  // 视频验证
  else if (fileType === 'video') {
    const maxSize = config.pic_text_video_size || CONFIG.MAX_VIDEO_SIZE;
    const maxDuration = config.pic_text_video_time || CONFIG.MAX_VIDEO_DURATION;
    
    if (size > maxSize) {
      const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
      return { 
        isValid: false, 
        error: `视频不能超过${maxSizeMB}M` 
      };
    }
    
    if (duration > maxDuration) {
      return { 
        isValid: false, 
        error: `视频不能超过${maxDuration}秒` 
      };
    }
  }

  return { isValid: true };
}

/**
 * 显示选择结果
 */
function showSelectionResult(result) {
  const { valid, invalid, total } = result;
  
  if (invalid.length === 0) {
    wx.showToast({
      title: `已选择 ${valid.length} 个文件`,
      icon: 'success',
      duration: 2000
    });
    return;
  }

  // 有无效文件时显示详细提示
  wx.showModal({
    title: '文件选择结果',
    content: `有效文件: ${valid.length} 个\n无效文件: ${invalid.length} 个\n\n无效文件将不会被上传。`,
    showCancel: false,
    confirmText: '知道了'
  });

  // 在控制台输出详细信息
  if (invalid.length > 0) {
    console.warn('无效文件列表:', invalid);
  }
}

/**
 * 显示上传结果
 */
function showUploadResult(successCount, errorCount) {
  if (errorCount === 0) {
    wx.showToast({
      title: `全部上传成功 (${successCount}个)`,
      icon: 'success',
      duration: 3000
    });
  } else if (successCount === 0) {
    wx.showToast({
      title: '全部上传失败',
      icon: 'error',
      duration: 3000
    });
  } else {
    wx.showModal({
      title: '上传结果',
      content: `成功: ${successCount} 个\n失败: ${errorCount} 个`,
      showCancel: false,
      confirmText: '确定'
    });
  }
}

/**
 * 检查是否为GIF文件
 */
export function isGifFile(filePath) {
  const lowerPath = filePath.toLowerCase();
  return lowerPath.includes('.gif') || lowerPath.endsWith('.gif');
}

/**
 * 图片压缩（可选）
 */
export async function getTempUrlCompress(downUrl, quality = 50, maxWidth = 640, maxHeight = 800) {
  try {
    
    console.log('downUrl:', downUrl);
    // 2. 然后在小程序端调用 wx.compressImage
    const compressedPath = await new Promise((resolve, reject) => {
      wx.compressImage({
        src: downUrl,
        quality: quality,
        // width: maxWidth,
        // height: maxHeight,
        success(res) {
          resolve(res.tempFilePath);
        },
        fail(err) {
          reject(err);
        }
      });
    });

    console.log('压缩成功:', compressedPath);
    return compressedPath;

  } catch (error) {
    console.error('处理失败:', error);
    throw error;
  }
}

/**
 * 生成UUID
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 工具函数：获取文件大小文本
 */
export function getFileSizeText(size) {
  if (size < 1024) return size + 'B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + 'KB';
  return (size / (1024 * 1024)).toFixed(1) + 'MB';
}

/**
 * 工具函数：获取文件类型图标
 */
export function getFileTypeIcon(fileType) {
  return fileType === 'image' ? '🖼️' : '🎥';
}