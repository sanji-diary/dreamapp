// App frontend. Supply a game origin from the app configuration.
export function mountShepherdGame({iframe, launch, gameOrigin, collect, onError}) {
  const origin = new URL(gameOrigin).origin;
  const url = new URL(launch.gameUrl);
  if (url.origin !== origin) throw new Error('게임 주소를 확인해 주세요.');
  let active = true;
  async function message(event) {
    if (event.origin !== origin || event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (data?.type !== 'dreamforest.minigame.completed' || data.version !== 1 ||
        data.gameId !== 'shepherd-coop' || data.launchId !== launch.launchId ||
        typeof data.roundId !== 'string') return;
    try {
      await collect({launchId: launch.launchId, roundId: data.roundId});
    } catch (error) {
      if (active) onError?.(error);
    }
  }
  window.addEventListener('message', message);
  iframe.title = '한 마리 어디 갔어?';
  iframe.src = url.href;
  return () => {
    active = false;
    window.removeEventListener('message',message);
  };
}
