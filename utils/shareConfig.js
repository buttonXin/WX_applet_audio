// 分享相关 UI 的统一开关。
// 云服务已关闭，暂时隐藏所有分享入口；恢复分享时把 ENABLE_SHARE 改回 true 即可。
export const ENABLE_SHARE = false;

/**
 * 页面加载时调用：同步 enableShare 到页面数据，并关闭右上角转发菜单
 * @param {Object} page 页面实例（this）
 */
export function applyShareConfig(page) {
  page.setData({ enableShare: ENABLE_SHARE });
  if (!ENABLE_SHARE && wx.hideShareMenu) {
    wx.hideShareMenu({
      menus: ['shareAppMessage', 'shareTimeline']
    });
  }
}
