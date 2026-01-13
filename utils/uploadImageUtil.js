
// 最大图片限制（3M）
const MAX_SIZE = 3 * 1024 * 1024;

// 云开发上传
/**
 * 核心上传方法：上传图片到云存储并返回imageId
 * @param {object} options 上传参数
 * @param {string} options.filePath 图片本地临时路径
 * @param {string} options.type 图片还是视频
 *  
 * 
          try {
          // 调用工具类的上传方法
          const { imageId , tempFile } = await uploadImageToCloud({
            type: 1,
            filePath: filePath,
            pageContext: this // iOS压缩需要页面上下文
          });
          console.log('上传成功 imageId = ', imageId);
        } catch (err) {
          // 处理上传失败
          console.error('上传失败', err);
        }
 * 
 */
export async function uploadToCloud() {
  // const {  filePath } = options;
  const { filePath ,  fileType ,tempFile} = await chooseImage()
  wx.showLoading({ title: '上传中...', mask: true });
  let cloudPath ;
  if(fileType === 'image'){
    cloudPath = `images/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
  }
  if(fileType === 'video'){
    cloudPath = `videos/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp4`;
  }

  
  const res = await new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
     filePath: filePath,
      success: resolve,
      fail: reject
    });
  });
  if(res.fileID){
      const fileID = res.fileID;
      console.log('上传成功 fileID = ', fileID);

      wx.showToast({ title: '上传成功', icon: 'success' });
     
      const downUrl = await new Promise((resolve, reject) => {
        wx.cloud.getTempFileURL({
          fileList: [{
            fileID: fileID, // 替换为实际的文件ID
            maxAge: 7200 // 明确设置有效期為7200秒（2小时）
          }],
          success: res => {
            // 成功获取到临时链接
            const tempFileURL = res.fileList[0].tempFileURL;
            console.log('这是可分享的2小时有效链接：', tempFileURL);
            // 接下来你可以将这个 tempFileURL 分享给任何人
            // return tempFileURL;
            resolve(tempFileURL);
          },
          fail: err => {
            console.error('获取临时链接失败：', err);
          }
        })
      });

      console.log('上传成功 downUrl = ', downUrl );
      wx.hideLoading();

      return { fileID , downUrl,  tempFile};
  }

    wx.hideLoading();
    console.error('上传失败', err);
    wx.showToast({
      title: '上传失败',
      icon: 'none'
    });
    throw new Error('上传失败');
    // return {  tempFile};
}

/**
 * 检查是否为GIF文件
 * @param {string} filePath 图片路径
 * @returns {boolean} 是否为GIF
 */
export function isGifFile(filePath) {
  const lowerPath = filePath.toLowerCase();
  return lowerPath.includes('.gif') || lowerPath.endsWith('.gif');
}

/**
 * 选择图片的快捷方法（可选封装）
 * @returns {Promise<string>} 选中的图片临时路径
 */
export function chooseImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFile = res.tempFiles[0];
      // ========== 核心：获取并判断文件类型 ==========
      const fileType = tempFile.fileType; // 'image' 或 'video'
      console.log('选择的文件类型：', fileType);

           // ========== 核心：获取并判断文件类型 ==========
         // 根据类型执行不同逻辑
      if (fileType === 'image') {
        // 原有图片处理逻辑（GIF检测、大小检测、缩略图生成等）
        if (isGifFile(tempFile.tempFilePath)) {
          wx.showToast({ title: '不支持GIF图片', icon: 'none' });
          return;
        }
        if (tempFile.size > MAX_SIZE) {
          const maxSizeMB = this.data.maxSize / (1024 * 1024);
          wx.showToast({ title: `图片太大了，不能超过${maxSizeMB}M`, icon: 'none' });
          return;
        }
        // ... 后续图片压缩、上传逻辑
      } else if (fileType === 'video') {
        // 新增视频处理逻辑（示例）
        // 视频大小/时长限制、缩略图生成等
        const maxVideoSize = 20 * 1024 * 1024; // 视频最大10M
        const maxVideoDuration = 60; // 视频最长60秒
        if (tempFile.size > maxVideoSize) {
          wx.showToast({ title: '视频太大了，不能超过10M', icon: 'none' });
          return;
        }
        // if (tempFile.duration > maxVideoDuration) {
        //   wx.showToast({ title: '视频太长了，不能超过60秒', icon: 'none' });
        //   return;
        // }
        console.log('选择的视频时长：', tempFile.duration, '秒');
        // 视频缩略图生成（可选）
        // wx.getVideoThumbnail({...})
      
      }
      const filePath = res.tempFiles[0].tempFilePath;

      // return { filePath ,  fileType , tempFile};
        resolve({filePath ,  fileType , tempFile});
      },
      fail: (err) => {
        console.log('选择图片失败', err);
        reject(err);
      }
    });
  });
}

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

    // 生成UUID（通用唯一标识符）
    export function  generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        // 随机生成16进制数
        const r = Math.random() * 16 | 0;
        // 固定UUID的版本位和变体位，符合标准
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }