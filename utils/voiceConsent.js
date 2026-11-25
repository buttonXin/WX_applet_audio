// 声纹授权:录音前必须取得用户同意
const CONSENT_KEY = 'voiceConsentV1'; // 协议版本变化时改 key,用户会被要求重新同意

function hasConsent() {
  return !!wx.getStorageSync(CONSENT_KEY);
}

function grantConsent() {
  wx.setStorageSync(CONSENT_KEY, { at: Date.now() });
}

// 带 consent=1 打开时,协议页会显示「同意」按钮
function openAgreement() {
  wx.navigateTo({ url: '/pages/agreement/index?consent=1' });
}

module.exports = { CONSENT_KEY, hasConsent, grantConsent, openAgreement };
