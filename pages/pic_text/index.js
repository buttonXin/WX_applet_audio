import { 
  uploadToCloud, 
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
      const { fileID , downUrl,  tempFile} = await uploadToCloud();

      const entry = {
          id: `${Date.now()}-${Math.random()}`,
          type: 'media',
          mediaType: tempFile.fileType === 'video' ? 'video' : 'image',
          url: tempFile.tempFilePath,
          poster: tempFile.thumbTempFilePath || '',
          tempUrl : downUrl || '',
        };
        this.prependEntry(entry);
      console.log('上传成功 fileID = ', fileID);
      const db = wx.cloud.database();
      const addRes = await db.collection('audios').add({
        data: {
          title:  '图片-视频-文字分享类型',
          fileID: fileID,
          burn:  1, 
          traceId: 'not save',  // 保存追踪ID
          checkStatus: 'pending',             // pending/pass/reject
          uuid : this.data.uuid,
          createTime: db.serverDate()
        }
      });
    } catch (err) {
      // 处理上传失败
      console.error('上传失败', err);
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
      feedList: this.data.feedList
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
