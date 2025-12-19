Page({
  data: {
    inputText: '',        // 输入的文字
    textImgPath: '',      // 文字转图片的临时路径
    qrcodePath: '',       // 二维码临时路径
    bgColor: '#ff6b8b',   // 默认背景色（参考图粉色）
    mainCanvas: null,     // 主Canvas节点
    mainCtx: null         // 主Canvas上下文
  },

  onLoad() {
    // 初始化主Canvas
    this.initMainCanvas();
    // 初始化生成二维码（以小程序主页为例，可自定义路径）
    this.generateQRCode('/pages/text-to-img/text-to-img');
  },

  // 初始化主Canvas（用于绘制最终生成的图片）
  initMainCanvas() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#mainCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        
        // 适配高清屏
        canvas.width = 600 * dpr;
        canvas.height = 800 * dpr;
        ctx.scale(dpr, dpr);

        this.setData({
          mainCanvas: canvas,
          mainCtx: ctx
        });
      });
  },

  // 输入文字监听
  onTextInput(e) {
    this.setData({ inputText: e.detail.value });
    // 实时生成文字转图片
    this.generateTextImage(e.detail.value);
  },

  // 生成文字转图片（核心：Canvas绘制文字）
  generateTextImage(text) {
    if (!text) {
      this.setData({ textImgPath: '' });
      return;
    }

    // 创建临时Canvas绘制文字
    const textCanvas = wx.createOffscreenCanvas({ type: '2d', width: 450, height: 200 });
    const textCtx = textCanvas.getContext('2d');
    
    // 绘制文字背景
    textCtx.fillStyle = '#fff';
    textCtx.fillRect(0, 0, 450, 200);
    
    // 绘制文字（自动换行）
    textCtx.fillStyle = '#333';
    textCtx.font = '28rpx sans-serif';
    textCtx.textAlign = 'left';
    textCtx.textBaseline = 'top';
    
    // 文字自动换行处理
    const lineHeight = 40; // 行高
    let y = 20; // 起始Y坐标
    const maxWidth = 410; // 最大宽度
    const words = text.split('');
    let line = '';
    
    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i];
      const metrics = textCtx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        textCtx.fillText(line, 20, y);
        line = words[i];
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    textCtx.fillText(line, 20, y);

    // 导出文字图片为临时路径
    wx.canvasToTempFilePath({
      canvas: textCanvas,
      success: (res) => {
        this.setData({ textImgPath: res.tempFilePath });
      },
      fail: (err) => {
        console.log('文字转图片失败', err);
        wx.showToast({ title: '文字转图失败', icon: 'none' });
      }
    });
  },

  // 生成二维码（微信原生接口）
  generateQRCode(path) {
    wx.qrcode.generate({
      path: path,       // 扫码后跳转的小程序路径
      width: 200,       // 二维码宽度
      correctLevel: 1,  // 纠错级别
      success: (res) => {
        this.setData({ qrcodePath: res.imagePath });
      },
      fail: (err) => {
        console.log('生成二维码失败', err);
        wx.showToast({ title: '二维码生成失败', icon: 'none' });
      }
    });
  },

  // 换背景色
  changeBgColor() {
    // 预设颜色数组（可自定义）
    const colors = ['#ff6b8b', '#1890ff', '#07c160', '#ff7d00', '#9254de', '#ff4d4f'];
    const currentIndex = colors.findIndex(color => color === this.data.bgColor);
    const nextIndex = (currentIndex + 1) % colors.length;
    this.setData({ bgColor: colors[nextIndex] });
  },

  // 绘制最终图片（合并标题+文字图+二维码+背景色）
  generateImage() {
    if (!this.data.inputText) {
      wx.showToast({ title: '请先输入文字', icon: 'none' });
      return;
    }

    const { mainCanvas, mainCtx, bgColor, textImgPath, qrcodePath } = this.data;
    if (!mainCtx) return;

    // 1. 清空画布
    mainCtx.clearRect(0, 0, 600, 800);

    // 2. 绘制背景色
    mainCtx.fillStyle = bgColor;
    mainCtx.fillRect(0, 0, 600, 800);

    // 3. 绘制标题
    mainCtx.fillStyle = '#fff';
    mainCtx.font = 'bold 40rpx sans-serif';
    mainCtx.textAlign = 'center';
    mainCtx.fillText('复读机', 300, 60);

    // 4. 绘制文字转图片
    const textImg = mainCanvas.createImage();
    textImg.src = textImgPath;
    textImg.onload = () => {
      mainCtx.drawImage(textImg, 75, 120, 450, 200);

      // 5. 绘制二维码
      const qrcodeImg = mainCanvas.createImage();
      qrcodeImg.src = qrcodePath;
      qrcodeImg.onload = () => {
        mainCtx.drawImage(qrcodeImg, 200, 360, 200, 200);

        // 6. 导出最终图片（可选：预览用）
        wx.canvasToTempFilePath({
          canvas: mainCanvas,
          success: (res) => {
            console.log("pic= " + res.tempFilePath)
            this.setData({ finalImagePath: res.tempFilePath });
            wx.showToast({ title: '图片生成成功', icon: 'success' });
          },
          fail: (err) => {
            console.log('最终图片生成失败', err);
            wx.showToast({ title: '图片生成失败', icon: 'none' });
          }
        });
      };
    };
  },

  // 保存到相册
  saveToAlbum() {
    if (!this.data.finalImagePath) {
      wx.showToast({ title: '请先生成图片', icon: 'none' });
      return;
    }

    // 申请保存到相册权限
    wx.authorize({
      scope: 'scope.writePhotosAlbum',
      success: () => {
        wx.saveImageToPhotosAlbum({
          filePath: this.data.finalImagePath,
          success: () => {
            wx.showToast({ title: '保存到相册成功', icon: 'success' });
          },
          fail: (err) => {
            console.log('保存相册失败', err);
            wx.showToast({ title: '保存失败，请重试', icon: 'none' });
          }
        });
      },
      fail: () => {
        // 权限拒绝，引导用户开启
        wx.showModal({
          title: '权限提示',
          content: '需要您授权保存图片到相册',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting({
                success: (settingRes) => {
                  if (settingRes.authSetting['scope.writePhotosAlbum']) {
                    this.saveToAlbum(); // 重新调用保存
                  }
                }
              });
            }
          }
        });
      }
    });
  }
});