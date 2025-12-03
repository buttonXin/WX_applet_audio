// index.js

Page({
  data: {
    hasUserInfo: false,
    // 录音相关数据
    isRecording: false,
    recordingManager: null,
    recordFileName: '',
    tempFilePath: '',
    // 音频播放相关数据
    audioManager: null,
    isPlaying: false,
    savedFilePath: '',
    // 录音文件列表
    recordFiles: [],
    // 当前播放的文件索引
    currentPlayingIndex: -1,
    // 录音倒计时相关数据
    recordingCountdown: 0,
    recordingTimer: null,
    maxRecordingTime: 60, // 最大录音时间（秒）
  },
  
  // 页面卸载时清理资源
  onUnload() {
    // 停止录音倒计时
    this.stopRecordingCountdown()
    
    // 不再停止播放进度更新（已移除该功能）
    
    // 销毁音频管理器
    if (this.audioManager) {
      this.audioManager.destroy()
    }
    
    // 销毁录音管理器
    if (this.recorderManager) {
      this.recorderManager.stop()
    }
  },
  
  // 获取音频文件时长
  getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
      const audioContext = wx.createInnerAudioContext()
      audioContext.src = filePath
      
      audioContext.onCanplay(() => {
        // 延迟一下确保时长信息已加载
        setTimeout(() => {
          const duration = Math.floor(audioContext.duration)
          audioContext.destroy()
          resolve(duration)
        }, 100)
      })
      
      audioContext.onError((err) => {
        audioContext.destroy()
        reject(err)
      })
      
      // 设置超时处理
      setTimeout(() => {
        audioContext.destroy()
        reject(new Error('获取音频时长超时'))
      }, 3000)
    })
  },
  
  // 更新录音文件时长
  async updateRecordFileDuration(index) {
    const recordFiles = this.data.recordFiles
    const file = recordFiles[index]
    
    if (!file || file.duration) {
      return // 如果已经有时长信息，跳过
    }
    
    try {
      const duration = await this.getAudioDuration(file.filePath)
      recordFiles[index].duration = duration
      
      this.setData({
        recordFiles: recordFiles
      })
    } catch (error) {
      console.error('获取音频时长失败:', error)
      // 如果获取失败，设置为未知
      recordFiles[index].duration = '未知'
      this.setData({
        recordFiles: recordFiles
      })
    }
  },
  
  // 录音相关方法
  onLoad() {
    // 初始化录音管理器
    this.recorderManager = wx.getRecorderManager()
    
    // 初始化音频播放管理器
    this.audioManager = wx.createInnerAudioContext()
    
    // 录音开始事件
    this.recorderManager.onStart(() => {
      console.log('录音开始')
      this.setData({
        isRecording: true
      })
    })
    
    // 录音结束事件
    this.recorderManager.onStop((res) => {
      console.log('录音结束', res)
      const { tempFilePath } = res
      
      // 确保倒计时被清理
      this.stopRecordingCountdown()
      
      this.setData({
        isRecording: false,
        tempFilePath: tempFilePath
      })
      
      // 保存录音文件
      this.saveRecordFile(tempFilePath)
    })
    
    // 录音错误事件
    this.recorderManager.onError((err) => {
      console.error('录音错误', err)
      wx.showToast({
        title: '录音失败',
        icon: 'error'
      })
      this.setData({
        isRecording: false
      })
    })
    
    // 音频播放事件
    this.audioManager.onPlay(() => {
      console.log('开始播放')
      this.setData({
        isPlaying: true
      })
      // 不再更新播放进度时间
    })
    
    this.audioManager.onStop(() => {
      console.log('停止播放')
      this.setData({
        isPlaying: false
      })
      // 不再停止播放进度更新
    })
    
    this.audioManager.onEnded(() => {
      console.log('播放结束')
      
      // 不再重置当前播放时间
      
      this.setData({
        isPlaying: false,
        currentPlayingIndex: -1
      })
      // 不再停止播放进度更新
    })
    
    this.audioManager.onError((err) => {
      console.error('播放错误', err)
      wx.showToast({
        title: '播放失败',
        icon: 'error'
      })
      this.setData({
        isPlaying: false
      })
      // 不再停止播放进度更新
    })
  },
  
  // 生成默认录音文件名
  generateDefaultFileName() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    
    return `${year}-${month}${day}-${hours}${minutes}-recording.mp3`
  },
  
  // 自动设置录音文件名（在录音停止时）
  autoSetRecordFileName() {
    const defaultName = this.generateDefaultFileName()
    this.setData({
      recordFileName: defaultName
    })
  },
  
  // 开始录音倒计时
  startRecordingCountdown() {
    const maxTime = this.data.maxRecordingTime
    this.setData({
      recordingCountdown: maxTime
    })
    
    // 创建定时器
    this.data.recordingTimer = setInterval(() => {
      const currentCount = this.data.recordingCountdown
      if (currentCount > 0) {
        this.setData({
          recordingCountdown: currentCount - 1
        })
      } else {
        // 倒计时结束，自动停止录音
        this.stopRecordingCountdown()
        this.stopRecord()
      }
    }, 1000)
  },
  
  // 停止录音倒计时
  stopRecordingCountdown() {
    if (this.data.recordingTimer) {
      clearInterval(this.data.recordingTimer)
      this.setData({
        recordingTimer: null,
        recordingCountdown: 0
      })
    }
  },
  
  // 从文件名提取录制时间
  extractTimeFromFileName(fileName) {
    const match = fileName.match(/(\d{4})-(\d{2})(\d{2})-(\d{2})(\d{2})-recording\.mp3/)
    if (match) {
      const [, year, month, day, hours, minutes] = match
      return `${year}-${month}-${day} ${hours}:${minutes}`
    }
    return '未知时间'
  },
  
  // 开始录音
  startRecord() {
    if (this.data.isRecording) {
      wx.showToast({
        title: '正在录音中',
        icon: 'none'
      })
      return
    }
    
    const defaultFileName = this.generateDefaultFileName()
    this.setData({
      recordFileName: defaultFileName
    })
    
    const options = {
      duration: this.data.maxRecordingTime * 1000, // 使用配置的最大录音时间
      sampleRate: 44100,
      numberOfChannels: 2,
      encodeBitRate: 192000,
      format: 'mp3',
      frameSize: 50
    }
    
    this.recorderManager.start(options)
    
    // 开始倒计时
    this.startRecordingCountdown()
    
    wx.showToast({
      title: '开始录音',
      icon: 'success'
    })
  },
  
  // 停止录音
  stopRecord() {
    if (!this.data.isRecording) {
      wx.showToast({
        title: '没有正在进行的录音',
        icon: 'none'
      })
      return
    }
    
    // 停止倒计时
    this.stopRecordingCountdown()
    
    this.recorderManager.stop()
    // 自动设置录音文件名
    this.autoSetRecordFileName()
  },
  
  // 保存录音文件
  async saveRecordFile(tempFilePath) {
    const fileName = this.data.recordFileName
    if (!fileName) {
      return
    }
    
    // 保存到本地文件系统
    const fileSystemManager = wx.getFileSystemManager()
    const savePath = `${wx.env.USER_DATA_PATH}/${fileName}`
    
    try {
      const result = await new Promise((resolve, reject) => {
        fileSystemManager.saveFile({
          tempFilePath: tempFilePath,
          filePath: savePath,
          success: resolve,
          fail: reject
        })
      })
      
      console.log('录音文件保存成功', result.savedFilePath)
      
      // 获取音频时长
      let duration = '未知'
      try {
        duration = await this.getAudioDuration(result.savedFilePath)
      } catch (error) {
        console.error('获取音频时长失败:', error)
      }
      
      const fileInfo = {
        fileName: fileName,
        filePath: result.savedFilePath,
        createTime: new Date().toLocaleString('zh-CN'),
        recordTime: this.extractTimeFromFileName(fileName),
        duration: duration
      }
      
      // 添加到文件列表
      const recordFiles = this.data.recordFiles
      recordFiles.push(fileInfo)
      
      this.setData({
        savedFilePath: result.savedFilePath,
        recordFiles: recordFiles,
        recordFileName: '' // 清空当前录音文件名
      })
      
      wx.showToast({
        title: '录音保存成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('保存录音文件失败', error)
      wx.showToast({
        title: '保存失败',
        icon: 'error'
      })
    }
  },
  
  // 输入文件名
  onFileNameInput(e) {
    let fileName = e.detail.value
    
    // 确保文件名包含时间戳
    if (!fileName.includes('recording')) {
      const timeStamp = this.generateDefaultFileName().split('-')[0] + '-' + this.generateDefaultFileName().split('-')[1]
      if (!fileName.includes(timeStamp)) {
        fileName = timeStamp + '-' + fileName
      }
    }
    
    // 确保文件扩展名
    if (!fileName.endsWith('.mp3')) {
      fileName += '.mp3'
    }
    
    this.setData({
      recordFileName: fileName
    })
  },
  
  // 播放录音文件
  playRecord() {
    if (!this.data.savedFilePath && !this.data.tempFilePath) {
      wx.showToast({
        title: '没有可播放的录音文件',
        icon: 'none'
      })
      return
    }
    
    if (this.data.isPlaying) {
      this.stopPlay()
      return
    }
    
    const filePath = this.data.savedFilePath || this.data.tempFilePath
    
    this.audioManager.src = filePath
    this.audioManager.play()
    
    wx.showToast({
      title: '开始播放',
      icon: 'success'
    })
  },
  
  // 停止播放
  stopPlay() {
    if (this.data.isPlaying) {
      this.audioManager.stop()
      this.setData({
        isPlaying: false,
        currentPlayingIndex: -1
      })
      wx.showToast({
        title: '停止播放',
        icon: 'none'
      })
    }
  },
  
  // 播放列表中的文件
  async playFile(e) {
    const index = e.currentTarget.dataset.index
    const file = this.data.recordFiles[index]
    
    // 如果正在播放当前文件，则停止播放
    if (this.data.currentPlayingIndex === index && this.data.isPlaying) {
      this.stopPlay()
      return
    }
    
    // 停止当前播放的文件（如果有）
    if (this.data.isPlaying) {
      this.stopPlay()
    }
    
    // 获取音频时长（如果还没有的话）
    await this.updateRecordFileDuration(index)
    
    // 播放新文件
    this.audioManager.src = file.filePath
    this.audioManager.play()
    
    this.setData({
      currentPlayingIndex: index,
      isPlaying: true
    })
    
    wx.showToast({
      title: '开始播放',
      icon: 'success'
    })
  },
  
  // 删除文件
  deleteFile(e) {
    const index = e.currentTarget.dataset.index
    const file = this.data.recordFiles[index]
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除文件 "${file.fileName}" 吗？`,
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#ff4444',
      success: (res) => {
        if (res.confirm) {
          // 如果正在播放这个文件，先停止播放
          if (this.data.currentPlayingIndex === index) {
            this.stopPlay()
          }
          
          // 从列表中删除文件
          const recordFiles = this.data.recordFiles
          recordFiles.splice(index, 1)
          
          this.setData({
            recordFiles: recordFiles
          })
          
          wx.showToast({
            title: '文件删除成功',
            icon: 'success'
          })
        }
      }
    })
  },
  
  // 编辑文件名（弹窗模式）
  editFileName(e) {
    const index = e.currentTarget.dataset.index
    const file = this.data.recordFiles[index]
    
    wx.showModal({
      title: '修改文件名',
      content: '',
      editable: true,
      placeholderText: '请输入新的文件名',
      value: file.fileName.replace('.mp3', ''),
      confirmText: '完成',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm && res.content) {
          let newFileName = res.content.trim()
          
          // 确保文件扩展名
          if (!newFileName.endsWith('.mp3')) {
            newFileName += '.mp3'
          }
          
          // 更新文件名
          const recordFiles = this.data.recordFiles
          recordFiles[index].fileName = newFileName
          
          this.setData({
            recordFiles: recordFiles
          })
          
          wx.showToast({
            title: '文件名修改成功',
            icon: 'success'
          })
        }
      }
    })
  }
})
