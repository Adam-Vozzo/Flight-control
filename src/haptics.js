// Tiny taps of feedback. Android uses the Vibration API. iOS Safari (18+)
// gives a haptic tick when a switch-style checkbox toggles, which only works
// inside a user gesture, so it is only attempted from touch handlers.

let enabled = true;

const PATTERNS = { grab: 6, snap: 12, land: [6, 50, 6], crash: [40, 40, 90] };

const isIOS = typeof navigator !== 'undefined'
  && (/iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.userAgent.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document));

export function hapticsAvailable() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && (isIOS || typeof navigator.vibrate === 'function');
}

export function setHaptics(on) {
  enabled = on;
}

export function haptic(kind = 'grab') {
  if (!enabled) return;
  try {
    if (!isIOS && typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind] ?? 8);
      return;
    }
    if (isIOS) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      label.appendChild(input);
      document.head.appendChild(label);
      label.click();
      label.remove();
    }
  } catch {
    /* feedback is optional */
  }
}
