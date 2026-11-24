// For a signed-in app screen using an iframe. collect posts IDs to the app backend.
export function mountEggGame({ iframe, launch, gameOrigin, collect, onError }) {
  const origin = new URL(gameOrigin).origin;
  const url = new URL(launch.gameUrl);
  if (url.origin !== origin) throw new Error('게임 주소를 확인해 주세요.');
  let active = true;
  async function receive(event) {
    if (!active || event.origin !== origin || event.source !== iframe.contentWindow) return;
    const message = event.data;
    if (message?.type !== 'dreamforest.minigame.completed' || message.version !== 1 ||
        message.gameId !== 'egg-hole-in-one' || message.launchId !== launch.launchId ||
        typeof message.roundId !== 'string') return;
    try {
      await collect({ launchId: launch.launchId, roundId: message.roundId });
    } catch (error) {
      if (active) onError?.(error);
    }
  }
  window.addEventListener('message', receive);
  iframe.title = '달걀 홀인원';
  iframe.src = url.href;
  return () => {
    active = false;
    window.removeEventListener('message', receive);
  };
}
