(() => {
  const ua = navigator.userAgent || '';
  const plat = navigator.platform || '';
  const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isIpadOSMacUA = ua.includes('Mac OS X') && touch;
  const isIOS = /iPad|iPhone|iPod/.test(plat) || /iPad|iPhone|iPod/.test(ua) || isIpadOSMacUA;
  if (isIOS) document.documentElement.classList.add('ios');
})();