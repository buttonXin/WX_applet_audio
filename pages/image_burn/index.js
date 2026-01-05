// pages/text-burn/index.js
// 阅后即焚页面

const MAX_SHARE_COUNT = 20; // 每天最大分享次数

function fmt(ms) {
  const sec = Math.floor(ms / 1000);
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function fmtStart(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 获取今天的日期字符串 YYYY-MM-DD
function getTodayStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// 生成时间戳精确到秒
function getTimestampStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

Page({
  data: { 
    imagePath: '',        // 本地图片路径
        uploading: false,     // 上传中状态
        isUploaded: false,    // 是否已上传完成
        buttonText: '选择图片', // 按钮文字
        imageId: '', // 图片地址
       maxSize: 3 * 1024 * 1024 , // 最大3M（单位：字节）
       shareCoverPath: '',
       coverImage: false, // 缩略图当做封面

      // 查看模式选项
      viewModes: [
        { value: 'all_3s', label: '所有人仅可查看3秒' },
        { value: 'all_10s', label: '所有人仅可查看10秒' },
        { value: 'one_destroy', label: '仅一人可查看，查看完后销毁' },
        { value: 'all', label: '所有人可查看' }
      ],
      selectedMode: 'all_3s'  // 默认选择第一个

    },

    
   // ============ 分享次数管理 ============
  
  // 检查并重置分享次数（跨天重置）
  checkAndResetShareCount() {
    const today = getTodayStr();
    const stored = wx.getStorageSync('shareCountData_image_text') || {};
    
    // 如果不是今天的数据，重置
    if (stored.date !== today) {
      wx.setStorageSync('shareCountData_image_text', { date: today, count: 0 });
    }
  },
  
  // 获取今天的分享次数
  getTodayShareCount() {
    const today = getTodayStr();
    const stored = wx.getStorageSync('shareCountData_image_text') || {};
    
    if (stored.date === today) {
      return stored.count || 0;
    }
    return 0;
  },
  
  // 增加分享次数
  incrementShareCount() {
    const today = getTodayStr();
    const stored = wx.getStorageSync('shareCountData_image_text') || {};
    
    if (stored.date === today) {
      stored.count = (stored.count || 0) + 1;
    } else {
      stored.date = today;
      stored.count = 1;
    }
    
    wx.setStorageSync('shareCountData_image_text', stored);
    return stored.count;
  },
  
  // 检查是否可以分享
  canShare() {
    return this.getTodayShareCount() < MAX_SHARE_COUNT;
  },
  // ============ 分享次数管理 end ============

    onLoad(){
      const coverImage = wx.getStorageSync('coverImage');
      console.log('coverImage='+coverImage)
      // 默认开启封面
      this.setData({ canShare: this.canShare() , coverImage: coverImage|| true });

    },

    // 单选框切换
  onViewModeChange(e) {
    this.setData({
      selectedMode: e.detail.value
    });
    console.log('当前选择模式:', e.detail.value);
  },

     // 按钮点击处理
      handleButtonTap() {
        console.log('click',JSON.stringify(this.data));
        if (!this.canShare()) {
          this.setData({ canShare: false ,shareText:'' });
          wx.showToast({ title: `每天只能分享${MAX_SHARE_COUNT}次`, icon: 'none' });
          return
        }

        if (this.data.isUploaded) {
          // 已上传完成，分享功能由 open-type="share" 处理
          return;
        }

        if (this.data.imagePath) {
          // 已选择图片但未上传，执行上传
          this.uploadImage();
        } else {
          // 未选择图片，执行选择
          this.chooseImage();
        }
      },

  // 选择图片
    chooseImage() {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],  // 只选择图片，不包含视频
        sourceType: ['album', 'camera'],
        success:async (res) => {
          const tempFile = res.tempFiles[0];

          // 检查是否为 GIF
          if (this.isGifFile(tempFile.tempFilePath)) {
            wx.showToast({
              title: '不支持GIF图片',
              icon: 'none'
            });
            return;
          }
           // 检查文件大小
          if (tempFile.size > this.data.maxSize) {
            const maxSizeMB = this.data.maxSize / (1024 * 1024);
            wx.showToast({
              title: `图片太大了，不能超过${maxSizeMB}M`,
              icon: 'none',
              duration: 2000
            });
            return;
            }
            const systemInfo = wx.getSystemInfoSync();
            const isIos = systemInfo.platform === 'ios';
            console.log('isIos='+isIos);
            let thumbnailPath = '';
            if (isIos) {
              // iOS：用Canvas强制缩放尺寸（解决width/height参数失效问题）
              thumbnailPath = await this.compressByVisibleCanvas(tempFile.tempFilePath, 400, 320);
            } else {
              // Android：保留原有compressImage逻辑（尺寸参数生效）
              thumbnailPath =  await this.generateThumbnail(tempFile.tempFilePath);
            }
        
            console.log('thumbnailPath='+thumbnailPath)
            this.setData({ shareCoverPath: thumbnailPath }); // 保存封面路径
            this.setData({imagePath: tempFile.tempFilePath, uploading: true, buttonText: '上传中...'});
            this.uploadToCloud();

        },
        fail: (err) => {
          console.log('选择图片失败', err);
        }
      });
    },

    // 点击图片清除选择
    clearImage() {
      // 上传中或已上传完成时，不允许清除
      // if (this.data.uploading || this.data.isUploaded) {
      //   return;
      // }

      wx.showToast({ 
        title: '重新选择', 
        icon: 'none' ,
        duration: 2000,
      });
      this.setData({
        imagePath: '',        // 本地图片路径
        uploading: false,     // 上传中状态
        isUploaded: false,    // 是否已上传完成
        buttonText: '选择图片', // 按钮文字
        imageId: '', // 图片地址
      });
    },

  // 检查是否为GIF文件
  isGifFile(filePath) {
    const lowerPath = filePath.toLowerCase();
    return lowerPath.includes('.gif') || lowerPath.endsWith('.gif');
  },

    // 上传图片
  uploadImage() {
    console.log('选择图片path', this.data.imagePath);
    if (!this.data.imagePath) {
        wx.showToast({
          title: '请先选择图片',
          icon: 'none'
        });
        return;
        }
    this.setData({
    uploading: true,
    buttonText: '上传中...'
    });
    // 方式1: 使用云开发上传
    this.uploadToCloud();

    },

// 云开发上传
async uploadToCloud() {
    wx.showLoading({ title: '上传中...', mask: true });
    const cloudPath = `images/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;

    const res = await new Promise((resolve, reject) => {
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
       filePath: this.data.imagePath,
        success: resolve,
        fail: reject
      });
    });
    if(res.fileID){
      this.incrementShareCount();
        console.log('上传成功 fileID = ', res.fileID);
        console.log('图片上传成功 fileID = ', res.fileID);
        const imageId = await this.mediaCheckAndSave(res.fileID);
        console.log('图片审核上传成功 imageId = ', imageId);
        if(imageId){
          this.setData({
            uploading: false,
            isUploaded: true,
            buttonText: '分享',
            imageId: imageId,
          });
  
          wx.showToast({
            title: '上传成功',
            icon: 'success'
          });
          wx.hideLoading();
          return
        }
    }

    wx.hideLoading();
    console.error('上传失败', err);
    this.setData({
      imagePath: '',        // 本地图片路径
    uploading: false,     // 上传中状态
    isUploaded: false,    // 是否已上传完成
    buttonText: '重新上传', // 按钮文字
    imageId: '', // 图片地址
    });
    

    wx.showToast({
      title: '上传失败',
      icon: 'none'
    });
  },

  // 上传音频,并进行审核.
   mediaCheckAndSave: async function(fileID) {

      try {
        // 1. 上传文件到云存储
         // 2. 获取临时链接用于安全检测
         const urlRes = await wx.cloud.getTempFileURL({
          fileList: [fileID]
        });
        const tempFileURL = urlRes.fileList[0].tempFileURL;
        console.log('tempFileURL:', tempFileURL);

        // 3. 调用安全检测
        const checkRes = await wx.cloud.callFunction({
          name: 'mediaCheck',
          data: {
            mediaUrl: tempFileURL,
            mediaType: 2  // 1.音频 2.图片
          }
        });
        if (!checkRes.result.success) {
          throw new Error('安全检测请求失败');
        }
        // 4. 保存到数据库，状态为"审核中"
        const db = wx.cloud.database();
        const addRes = await db.collection('audios').add({
          data: {
            title:  '图片分享类型',
            fileID: fileID,
            burn:  this.data.selectedMode === 'one_destroy' ? 2 : 1, 
            traceId: checkRes.result.traceId,  // 保存追踪ID
            checkStatus: 'pending',             // pending/pass/reject
            createTime: db.serverDate()
          }
        });
        return addRes._id;

      } catch (err) {
        console.error('上传失败:', err);
        wx.showToast({
          title: '上传失败',
          icon: 'error'
        });
      } finally {
        wx.showToast({title: '上传失败',icon: 'error'});
        this.setData({ uploading: false, buttonText: '重新上传'});
      }
      return '';
    },
/**
 * 生成图片缩略图（用于分享封面）
 * @param {string} tempFilePath 原图临时路径
 * @returns {Promise<string>} 缩略图临时路径
 */
generateThumbnail(tempFilePath) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: tempFilePath,
      quality: 1, // 缩略图质量70足够（体积小）
      width: 800,  // 封面推荐宽度800px（高度按比例自动适配）
      height: 640, // 5:4比例，适配微信分享封面
      success: (res) => {
        // 校验缩略图大小（确保≤128KB）
        wx.getFileInfo({
          filePath: res.tempFilePath,
          success: (info) => {
            if (info.size > 128 * 1024) {
              // 若仍过大，再次压缩（质量降为50）
              wx.compressImage({
                src: res.tempFilePath,
                quality: 50,
                success: (res2) => resolve(res2.tempFilePath),
                fail: reject
              });
            } else {
              resolve(res.tempFilePath);
            }
          }
        });
      },
      fail: reject
    });
  });
},

  /**
   * iOS专属：使用页面内可见Canvas（隐藏）缩放图片（核心修复）
   * @param {string} tempFilePath - 原始路径
   * @param {number} targetWidth - 目标宽度
   * @param {number} targetHeight - 目标高度
   * @returns {Promise<string>} 缩放后路径
   */
compressByVisibleCanvas(tempFilePath, targetWidth, targetHeight) {
  return new Promise((resolve, reject) => {
    // 1. 获取原始图片信息
    wx.getImageInfo({
      src: tempFilePath,
      success: (imgInfo) => {
        // 2. 计算缩放比例（保持原比例，不拉伸）
        const scale = Math.min(
          targetWidth / imgInfo.width,
          targetHeight / imgInfo.height
        );
        const finalWidth = Math.floor(imgInfo.width * scale);
        const finalHeight = Math.floor(imgInfo.height * scale);

        // 3. 更新Canvas尺寸（和缩放后图片一致）
        this.setData({
          canvasWidth: finalWidth,
          canvasHeight: finalHeight
        }, () => {
          // 4. 获取Canvas节点并绘制图片
          const query = wx.createSelectorQuery().in(this);
          query.select('#compressCanvas').fields({ node: true, size: true }).exec((res) => {
            if (!res || !res[0] || !res[0].node) {
              reject(new Error('未找到compressCanvas节点'));
              return;
            }

            const canvas = res[0].node;
            const ctx = canvas.getContext('2d');
            // 设置Canvas实际渲染尺寸（关键：和显示尺寸一致）
            canvas.width = finalWidth;
            canvas.height = finalHeight;

            // 5. 创建图片并绘制到Canvas
            const img = canvas.createImage();
            img.onload = () => {
              // 清空画布并绘制缩放后的图片
              ctx.clearRect(0, 0, finalWidth, finalHeight);
              ctx.drawImage(img, 0, 0, finalWidth, finalHeight);

              // 6. 关键修复：使用wx.canvasToTempFilePath（而非Canvas实例的toTempFilePath）
              wx.canvasToTempFilePath({
                canvas: canvas, // 传入Canvas节点
                quality: 0.1, // 0-1，对应70%质量
                fileType: 'jpg', // iOS优先jpg，体积更小
                success: (res) => {
                  resolve(res.tempFilePath); // 返回缩略图路径
                },
                fail: (err) => {
                  reject(new Error(`Canvas导出失败：${err.errMsg}`));
                },
                // 必须指定Canvas所属的上下文（当前页面）
                complete: null,
                // 兼容低版本：指定canvasId（可选）
                canvasId: 'compressCanvas'
              }, this); // 关键：第二个参数传this，指向页面实例
            };

            img.onerror = (err) => {
              reject(new Error(`图片加载失败：${err}`));
            };
            img.src = tempFilePath;
          });
        });
      },
      fail: (err) => {
        reject(new Error(`获取图片信息失败：${err.errMsg}`));
      }
    });
  });
},

  onModeSwitchChange(e){
    const isChecked = e.detail.value; // 获取新的开关状态 (true 或 false)
    console.log('开关状态改变为:', isChecked);
     // 更新页面数据
     this.setData({
      coverImage: isChecked
    });
    wx.setStorageSync('coverImage', isChecked);

  },


   // 分享回调
   onShareAppMessage(res) {
    const {   imageId ,selectedMode ,coverImage ,shareCoverPath} = this.data;
    console.log("share=" , JSON.stringify(this.data))

    if(!imageId){
      return {
        title: '人类的本质是复读机',
        path: '/pages/record_cloud/index',
        imageUrl: '/assets/share_img.jpg', // 之前生成的图片作为封面
        // desc: '时间: ' + fmtStart(Date.now())
      }; 
    }

    this.setData({
      imagePath: '',        // 本地图片路径
      uploading: false,     // 上传中状态
      isUploaded: false,    // 是否已上传完成
      buttonText: '选择图片', // 按钮文字
      imageId: '', // 图片地址
    });
   
//    const time = '阅后即焚: ' + fmtStart(Date.now())  ;
    const time = '分享内容'  ;
    let imageUrl = '/assets/image_ph.jpg';
    if(coverImage){
      imageUrl = shareCoverPath || '/assets/image_ph.jpg';
    }
    return {
      title: time,
      path: '/pages/friend_image_burn_shared/index?imageId=' + imageId + "&text_butn_time=" + time
      + "&selectedMode=" + selectedMode, // 携带多个参数的路径
      imageUrl: imageUrl, // 之前生成的图片作为封面
      // desc: '时间: ' + fmtStart(Date.now())
    };
  },

});
