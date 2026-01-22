import { 
  batchUploadToCloud, 
  chooseMedia,
  generateUUID
} from '../../utils/uploadImageUtil.js';

Page({
  data: {
    pageTitle: '吃瓜',
    feedList: [],
    uuid: generateUUID(),
  },

  askForText({ title, placeholder, onConfirm }) {
    wx.showModal({
      title,
      editable: true,
      placeholderText: placeholder,
      cancelText: '取消',
      confirmText: '确定',
      success: (res) => {
        if (!res.confirm) return;
        const value = (res.content || '').trim();
        if (!value) {
          wx.showToast({ title: '内容不能为空', icon: 'none' });
          return;
        }
        onConfirm(value);
      }
    });
  },

  onChangeTitle() {
    this.askForText({
      title: '更换标题',
      placeholder: '请输入新的标题',
      onConfirm: (value) => this.setData({ pageTitle: value })
    });
  },

  onAddText() {
    this.askForText({
      title: '输入文字',
      placeholder: '写点什么吧',
      onConfirm: (value) => {
        const entry = {
          id: `${Date.now()}-${Math.random()}`,
          type: 'text',
          content: value,
        };
        this.prependEntry(entry);
      }
    });
  },

  async onAddMedia() {

    try {
      // 调用工具类的上传方法

      // 云端获取数据来配置
      const configRes = await wx.cloud.callFunction({name: 'getTimeCount' })
      const config = configRes.result;

      // 2. 选择文件
      const selectionResult = await chooseMedia(config);
      console.log('选择结果:', selectionResult);

      if (selectionResult.valid.length === 0) {
        return;
      }

      // 3. 批量上传
      const uploadResult = await batchUploadToCloud(
        selectionResult.valid, 
        config , 
        this.data.uuid
      );
      
      console.log('上传结果:', uploadResult);
      console.log('上传结果:', JSON.stringify(uploadResult));
      
      // 4. 更新界面

      // 处理上传成功的文件，全部添加到 feedList
      if (uploadResult.success && uploadResult.success.length > 0) {
        this.handleUploadedFiles(uploadResult.success);
      }

      // 处理上传失败的文件，给出提示
      if (uploadResult.errors && uploadResult.errors.length > 0) {
        this.handleUploadErrors(uploadResult.errors);
      }

    } catch (err) {
      console.error('上传失败', err);
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      });
    }
  },
  

  /**
   * 处理上传成功的文件，全部添加到 feedList
   */
  handleUploadedFiles(successFiles) {
    const entries = successFiles.map((fileInfo, index) => {
      const timestamp = Date.now() + index; // 确保每个ID不同
      return {
        id: `${timestamp}-${Math.random()}`,
        type: 'media',
        mediaType: fileInfo.fileType === 'video' ? 'video' : 'image',
        url: fileInfo.tempFile.tempFilePath, // 本地临时路径
        poster: fileInfo.tempFile.thumbTempFilePath || '', // 缩略图
        tempUrl: fileInfo.downUrl || '', // 云端临时链接
        fileID: fileInfo.fileID, // 云存储文件ID
        cloudPath: fileInfo.cloudPath, // 云存储路径
        size: fileInfo.tempFile.size, // 文件大小
        duration: fileInfo.tempFile.duration || 0, // 视频时长
        uploadIndex: fileInfo.index, // 上传时的索引
        uploadTime: new Date().toISOString() // 上传时间
      };
    });

    // 将所有文件添加到 feedList
    entries.forEach(entry => {
      this.prependEntry(entry);
    });

    // 显示上传成功提示
    wx.showToast({
      title: `成功添加 ${entries.length} 个文件`,
      icon: 'success',
      duration: 2000
    });

    // 可选：保存到数据库
    this.saveToDatabase(successFiles);
  },

  /**
   * 处理上传失败的文件
   */
  handleUploadErrors(errors) {
    console.warn('上传失败的文件:', errors);
    
    if (errors.length > 0) {
      wx.showModal({
        title: '部分文件上传失败',
        content: `${errors.length} 个文件上传失败，成功文件已添加`,
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },
    /**
   * 保存到数据库
   */
    async saveToDatabase(successFiles) {
      try {
        const db = wx.cloud.database();
        
        // 批量保存到数据库
        const savePromises = successFiles.map(fileInfo => {
          return db.collection('audios').add({
            data: {
              title: '图片-视频-文字分享类型',
              fileID: fileInfo.fileID,
              burn: 1, 
              traceId: 'not save-111',
              checkStatus: 'pending',
              uuid: this.data.uuid,
              fileType: fileInfo.fileType,
              size: fileInfo.tempFile.size,
              duration: fileInfo.tempFile.duration || 0,
              createTime: db.serverDate()
            }
          });
        });
  
        const saveResults = await Promise.allSettled(savePromises);
        
        // 统计保存结果
        const successCount = saveResults.filter(result => result.status === 'fulfilled').length;
        const failCount = saveResults.filter(result => result.status === 'rejected').length;
        
        console.log(`数据库保存结果: 成功 ${successCount} 个, 失败 ${failCount} 个`);
        
        if (failCount > 0) {
          console.warn('部分文件保存到数据库失败:', saveResults.filter(result => result.status === 'rejected'));
        }
        
      } catch (error) {
        console.error('保存到数据库失败:', error);
      }
    },

  prependEntry(entry) {
    const { feedList } = this.data;
    // 核心修改：把entry放到数组最后面
    this.setData({ feedList: [...feedList, entry]});
  },

  onPreviewMedia(e) {
    const { id } = e.currentTarget.dataset;
    const medias = this.data.feedList.filter((item) => item.type === 'media');
    const current = medias.findIndex((item) => item.id === id);
    if (current < 0) return;

    wx.previewMedia({
      sources: medias.map((item) => ({
        url: item.url,
        type: item.mediaType === 'video' ? 'video' : 'image',
        poster: item.poster
      })),
      current
    });
  },

  buildSharePayload() {
    const payload = {
      title: this.data.pageTitle,
      uuid: this.data.uuid,
      feedList: this.data.feedList,
      shareTime: Date.now()
    };
    console.log("payload000 = ", JSON.stringify(payload))
    return encodeURIComponent(JSON.stringify(payload));
  },

  onShareAppMessage() {
    const payload = this.buildSharePayload();
    console.log("payload = ", JSON.stringify(payload))
    return {
      title: this.data.pageTitle || '吃瓜',
      path: `/pages/pic_text_shared/index?payload=${payload}`
    };
  },

});
