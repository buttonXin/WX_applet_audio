// pages/me/index.js
import { ENABLE_SHARE, applyShareConfig } from '../../utils/shareConfig';

Page({
  data: {
    // 查看模式选项（文字/图片模式已下线；分享关闭期间只保留音频模式）
    viewModes: ENABLE_SHARE
      ? [
          { value: '1', label: '音频模式 (默认)' },
          { value: '4', label: '图文模式 (点击打开)' }
        ]
      : [
          { value: '1', label: '音频模式 (默认)' }
        ],
    selectedMode: '1'  // 默认选择第一个
  },

  onLoad() {
    applyShareConfig(this);

    // 已下线的模式(2 文字, 3 图片)回退到音频模式
    let home_type = wx.getStorageSync('home_type');
    if (home_type !== '1' && !(ENABLE_SHARE && home_type === '4')) {
      home_type = '1';
      wx.setStorageSync('home_type', home_type);
    }
    console.log("首页模式 home_type = " + home_type);
    this.setData({ selectedMode: home_type });
  },

  // 单选框切换
  onViewModeChange(e) {
    this.setData({
      selectedMode: e.detail.value
    });
    wx.setStorageSync('home_type', e.detail.value);
    console.log('当前选择模式:', e.detail.value);
  },

  // 处理 radio-item 的点击事件
  onRadioItemClick(e) {
    const value = e.currentTarget.dataset.value; // 获取 data-value
    const label = e.currentTarget.dataset.label; // 获取 data-label (可选)
    console.log('点击了选项:', label, '值为:', value);
    if (value === '4' && ENABLE_SHARE) {
      wx.navigateTo({ url: '/pages/pic_text/index' });
    }
  },

});
