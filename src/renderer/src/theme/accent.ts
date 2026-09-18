/** Sets the accent hue that every accent colour and gradient is derived from. */
export function applyAccentHue(hue: number): void {
  document.documentElement.style.setProperty('--accent-h', String(hue))
}
