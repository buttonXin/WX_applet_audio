// index.js

Page({
  data: {
    hasUserInfo: false,
    // 录音相关数据
    isRecording: false,
    recordingTime: 0,
    recordTimer: null,
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
    // 高精度录音时长计时器
    recordingStartTime: 0, // 录音开始时间戳（毫秒）
    recordingDuration: 0,  // 录音时长（秒，保留两位小数）
    isRefreshing: false, // 下拉刷新状态
    isLoadingMore: false, // 是否正在加载更多
  },
  
  // 滚动到顶部加载更多
  async loadMoreHistory() {
    if (this.data.isLoadingMore) {
      return
    }

    this.setData({ isLoadingMore: true })

    try {
      const { allRecordFiles, recordFiles } = this.data
      const currentCount = recordFiles.length
      const totalCount = allRecordFiles.length

      if (currentCount >= totalCount) {
        // 没有更多数据了
        this.setData({ isLoadingMore: false })
        return
      }

      // 模拟网络延迟
      await new Promise(resolve => setTimeout(resolve, 1000))

      const nextBatch = allRecordFiles.slice(-(currentCount + 10), -currentCount)
      const updatedFiles = [...nextBatch, ...recordFiles]

      this.setData({
        recordFiles: updatedFiles,
      })

      // 异步获取新加载文件的时长
      nextBatch.forEach((file) => {
        this.updateRecordFileDuration(file.index)
      })

    } catch (error) {
      console.error('加载更多历史记录失败:', error)
    } finally {
      this.setData({ isLoadingMore: false })
    }
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
    const { allRecordFiles, recordFiles } = this.data
    const fileToUpdate = allRecordFiles[index]

    if (!fileToUpdate || fileToUpdate.duration) {
      return // 如果已经有时长信息，跳过
    }

    try {
      const duration = await this.getAudioDuration(fileToUpdate.filePath)
      // 更新 allRecordFiles
      allRecordFiles[index].duration = duration

      // 更新 recordFiles（如果存在）
      const recordFileIndex = recordFiles.findIndex(f => f.index === index)
      if (recordFileIndex > -1) {
        recordFiles[recordFileIndex].duration = duration
      }

      this.setData({
        allRecordFiles,
        recordFiles
      })
    } catch (error) {
      console.error('获取音频时长失败:', error)
      // 如果获取失败，设置为未知
      allRecordFiles[index].duration = '未知'
      const recordFileIndex = recordFiles.findIndex(f => f.index === index)
      if (recordFileIndex > -1) {
        recordFiles[recordFileIndex].duration = '未知'
      }
      this.setData({
        allRecordFiles,
        recordFiles
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
        isRecording: true,
        recordingTime: 0
      })
      // 创建计时器
      const timer = setInterval(() => {
        this.setData({
          recordingTime: this.data.recordingTime + 1
        })
      }, 1000)
      this.setData({ recordTimer: timer })
    })
    
    // 录音结束事件
    this.recorderManager.onStop((res) => {
      console.log('=== 录音结束事件触发 ===', res)
      const { tempFilePath } = res
      
      // 清理计时器
      if (this.data.recordTimer) {
        clearInterval(this.data.recordTimer)
      }
      
      // 计算高精度录音时长
      const endTime = performance.now();
      const startTime = this.data.recordingStartTime;
      const duration = ((endTime - startTime) / 1000).toFixed(2); // 转换为秒，保留两位小数
      
      console.log('录音时长计算:', {
        startTime: startTime,
        endTime: endTime,
        duration: duration + '秒',
        precision: '±50ms'
      });
      
      console.log('录音状态重置，准备保存文件...');
      this.setData({
        isRecording: false,
        recordTimer: null,
        tempFilePath: tempFilePath,
        recordingDuration: parseFloat(duration) // 保存时长到状态
      })
      
      // 保存录音文件
      console.log('开始调用saveRecordFile保存录音文件');
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

    // 加载初始录音文件
    this.loadRecordFiles()
  },
  
  // 生成默认录音文件名
  generateDefaultFileName() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    
    return `录音_${year}${month}${day}_${hours}${minutes}${seconds}.mp3`
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
  
  // 从文件名提取时间戳
  extractTimestampFromFileName(fileName) {
    const match = fileName.match(/录音_(\d{8})_(\d{6})\.mp3/)
    if (match) {
      const [, date, time] = match
      const year = date.substring(0, 4)
      const month = date.substring(4, 6) - 1 // 月份从0开始
      const day = date.substring(6, 8)
      const hours = time.substring(0, 2)
      const minutes = time.substring(2, 4)
      const seconds = time.substring(4, 6)
      return new Date(year, month, day, hours, minutes, seconds).getTime()
    }
    return 0 // 如果没有匹配，返回0
  },

  // 从文件名提取录制时间
  extractTimeFromFileName(fileName) {
    const match = fileName.match(/录音_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.mp3/)
    if (match) {
      const [, year, month, day, hours, minutes, seconds] = match
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }
    return '未知时间'
  },
  
  // 开始录音
  startRecord() {
    console.log('=== 开始录音流程 ===');
    if (this.data.isRecording) {
      wx.showToast({
        title: '正在录音中',
        icon: 'none'
      })
      return
    }
    
    const defaultFileName = this.generateDefaultFileName()
    console.log('生成的默认文件名:', defaultFileName);
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
    
    console.log('录音参数:', options);
    
    // 使用performance.now()获取高精度时间戳
    const startTime = performance.now();
    console.log('录音开始时间戳:', startTime);
    
    this.recorderManager.start(options)
    
    // 设置录音开始时间
    this.setData({
      recordingStartTime: startTime,
      recordingDuration: 0  // 重置时长
    });
    
    // 开始倒计时
    this.startRecordingCountdown()
    
    wx.showToast({
      title: '开始录音',
      icon: 'success'
    })
    
    console.log('录音已开始，等待结束事件...');
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
    console.log('=== 进入saveRecordFile函数 ===');
    const fileName = this.data.recordFileName
    console.log('saveRecordFile参数 - fileName:', fileName, 'tempFilePath:', tempFilePath);
    
    if (!fileName) {
      console.warn('文件名不存在，退出保存流程');
      return
    }
    
    // 保存到本地文件系统
// 获取文件系统管理器并验证
    let fileSystemManager;
    try {
      fileSystemManager = wx.getFileSystemManager();
      if (!fileSystemManager) {
        throw new Error('无法获取文件系统管理器');
      }
      console.log('文件系统管理器获取成功');
    } catch (error) {
      console.error('获取文件系统管理器失败:', error);
      wx.showToast({
        title: '文件系统错误',
        icon: 'error'
      });
      return;
    }
    
    try {
      console.log('开始保存文件到本地存储...');
      const result = await new Promise((resolve, reject) => {
        fileSystemManager.saveFile({
          tempFilePath: tempFilePath,
          filePath: savePath,
          success: resolve,
          fail: reject
        })
      })
      
      console.log('录音文件保存成功', result.savedFilePath)
      
      // 使用高精度计时器记录的时长，而不是动态获取
      const preciseDuration = this.data.recordingDuration;
      console.log('使用高精度计时器记录的时长:', preciseDuration + '秒');
      
      // 同步性验证：比较计时器时长与音频实际时长
      console.log('开始同步性验证...');
      try {
        const audioContext = wx.createInnerAudioContext();
        audioContext.src = result.savedFilePath;
        
        audioContext.onCanplay(() => {
          setTimeout(() => {
            const actualDuration = audioContext.duration;
            const timerDuration = preciseDuration;
            const difference = Math.abs(actualDuration - timerDuration);
            
            console.log('同步性验证结果:', {
              计时器时长: timerDuration + '秒',
              音频实际时长: actualDuration + '秒',
              误差范围: difference + '秒',
              精度验证: difference <= 0.05 ? '✅ 在±50ms误差范围内' : '❌ 超出±50ms误差范围'
            });
            
            audioContext.destroy();
          }, 100);
        });
        
        audioContext.onError((err) => {
          console.warn('同步性验证失败:', err);
          audioContext.destroy();
        });
      } catch (error) {
        console.warn('同步性验证出错:', error);
      }
      
      // 将时长信息添加到文件数据中
      const fileSystemManager = wx.getFileSystemManager();
      try {
        // 尝试获取文件信息来验证文件存在
        const stat = fileSystemManager.statSync(result.savedFilePath);
        console.log('文件状态信息:', stat);
      } catch (error) {
        console.warn('无法获取文件状态:', error);
      }
      
      // 为新保存的文件添加高精度时长信息
      const newlySavedFileName = this.data.recordFileName;
      console.log('为新保存的文件添加时长信息:', newlySavedFileName, '时长:', preciseDuration);
      
      // 更新当前文件列表，为新文件添加时长
      const { recordFiles, allRecordFiles } = this.data;
      const currentTime = new Date().toLocaleString();
      
      // 创建新文件对象，包含高精度时长
      const newFile = {
        fileName: newlySavedFileName,
        filePath: result.savedFilePath,
        recordTime: currentTime,
        timestamp: Date.now(),
        duration: preciseDuration,  // 使用高精度计时器记录的时长
        isNew: true  // 标记为新文件
      };
      
      console.log('新文件对象:', newFile);
      
      // 将新文件添加到列表开头（最新的文件）
      const updatedRecordFiles = [newFile, ...recordFiles];
      const updatedAllRecordFiles = [newFile, ...allRecordFiles];
      
      // 立即更新界面，无需等待异步加载
      this.setData({
        recordFiles: updatedRecordFiles,
        allRecordFiles: updatedAllRecordFiles
      });
      
      console.log('界面已更新，显示新文件:', updatedRecordFiles.length, '个文件');
      
      wx.showToast({
        title: '录音保存成功',
        icon: 'success'
      })

      console.log('开始滚动到底部显示新文件...');
      // 滚动到底部
      this.scrollToBottom()

    } catch (error) {
      console.error('保存录音文件失败', error)
      wx.showToast({
        title: '保存失败',
        icon: 'error'
      })
    }
    
    console.log('=== saveRecordFile函数执行完成 ===');
  },

  // 滚动到底部
  scrollToBottom() {
    console.log('=== 开始执行scrollToBottom ===');
    setTimeout(() => {
      console.log('创建选择器查询...');
      const query = wx.createSelectorQuery()
      query.select('.scroll-area').boundingClientRect()
      // query.select('.scroll-area').property('scrollHeight')
      query.exec((res) => {
        console.log('scroll-area查询结果:', res);
        if (res[1] && res[1].scrollHeight) {
          console.log('滚动到位置:', res[1].scrollHeight);
          wx.pageScrollTo({
            scrollTop: res[1].scrollHeight,
            duration: 300
          })
          console.log('滚动完成');
        } else {
          console.warn('无法获取scrollHeight或数据不完整');
        }
      })
    }, 100)
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
    const file = this.data.allRecordFiles[index]
    
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
    const file = this.data.allRecordFiles[index]
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除文件 "${file.fileName}" 吗？`,
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#ff4444',
      success: async (res) => {
        if (res.confirm) {
          // 如果正在播放这个文件，先停止播放
          if (this.data.currentPlayingIndex === index) {
            this.stopPlay()
          }

          const fileSystemManager = wx.getFileSystemManager()
          try {
            await new Promise((resolve, reject) => {
              fileSystemManager.unlink({
                filePath: file.filePath,
                success: resolve,
                fail: reject,
              })
            })
            wx.showToast({
              title: '文件删除成功',
              icon: 'success'
            })
            // 重新加载文件列表
            await this.loadRecordFiles()
          } catch (error) {
            console.error('删除文件失败', error)
            wx.showToast({
              title: '删除失败',
              icon: 'error'
            })
          }
        }
      }
    })
  },

  // 加载录音文件
  async loadRecordFiles() {
    console.log('loadRecordFiles called');
    const fileSystemManager = wx.getFileSystemManager()
    try {
      const res = await new Promise((resolve, reject) => {
        fileSystemManager.readdir({
          dirPath: wx.env.USER_DATA_PATH,
          success: resolve,
          fail: reject,
        })
      })

      console.log('readdir result:', res);

      const files = res.files
        .filter(fileName => fileName.startsWith('录音_') && fileName.endsWith('.mp3'))
        .map((fileName, index) => ({ // 添加 index
          index, // 添加索引
          fileName,
          filePath: `${wx.env.USER_DATA_PATH}/${fileName}`,
          recordTime: this.extractTimeFromFileName(fileName),
          timestamp: this.extractTimestampFromFileName(fileName),
        }))

      console.log('filtered and mapped files:', files);

      // 按时间戳升序排序
      files.sort((a, b) => a.timestamp - b.timestamp)
      
      // 重新为排序后的数组添加索引
      const sortedFiles = files.map((file, index) => ({
        ...file,
        index
      }));

      console.log('sortedFiles:', sortedFiles);

      // 初始加载最新的10条记录
      const initialFiles = sortedFiles.slice(-10)

      console.log('initialFiles:', initialFiles);

      this.setData({ 
        recordFiles: initialFiles,
        allRecordFiles: sortedFiles // 保存所有文件用于后续加载
      })

      console.log('setData completed, recordFiles:', this.data.recordFiles);

      // 异步获取每个文件的时长
      initialFiles.forEach((file) => {
        this.updateRecordFileDuration(file.index)
      })
    } catch (error) {
      console.error('读取录音文件列表失败', error)
      wx.showToast({
        title: '加载文件失败',
        icon: 'error',
      })
    }
  },

  // 下拉刷新
  async onRefresh() {
    this.setData({ isRefreshing: true })
    try {
      await this.loadRecordFiles()
      // 模拟网络延迟
      await new Promise(resolve => setTimeout(resolve, 1000))
      wx.showToast({ title: '刷新成功', icon: 'success', duration: 1500 })
    } catch (error) {
      console.error('刷新失败:', error)
      wx.showToast({ title: '刷新失败', icon: 'error' })
    } finally {
      this.setData({ isRefreshing: false })
    }
  },

  // 编辑文件名（弹窗模式）
  editFileName(e) {
    const index = e.currentTarget.dataset.index
    const file = this.data.allRecordFiles[index]
    
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
          const { allRecordFiles, recordFiles } = this.data
          const oldFilePath = allRecordFiles[index].filePath
          const newFilePath = `${wx.env.USER_DATA_PATH}/${newFileName}`

          const fileSystemManager = wx.getFileSystemManager()
          fileSystemManager.rename({
            oldPath: oldFilePath,
            newPath: newFilePath,
            success: () => {
              allRecordFiles[index].fileName = newFileName
              allRecordFiles[index].filePath = newFilePath

              const recordFileIndex = recordFiles.findIndex(f => f.index === index)
              if (recordFileIndex > -1) {
                recordFiles[recordFileIndex].fileName = newFileName
                recordFiles[recordFileIndex].filePath = newFilePath
              }

              this.setData({
                allRecordFiles,
                recordFiles
              })

              wx.showToast({
                title: '文件名修改成功',
                icon: 'success'
              })
            },
            fail: (err) => {
              console.error('重命名文件失败', err)
              wx.showToast({
                title: '修改失败',
                icon: 'error'
              })
            }
          })
        }
      }
    })
  }
})
