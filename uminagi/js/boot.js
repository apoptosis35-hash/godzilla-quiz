// Starts the game. With ?visit=CODE the friend's town is unpacked first (store.js), so that everything the game
// reads at start-up (the town's districts, the save) comes from their copy; nothing of theirs or ours is written.
import { decode } from './store.js';

const code = new URLSearchParams(location.search).get('visit');
if (code) {
  try {
    const obj = await decode(code);
    globalThis.__uminagiVisit = { name: obj.name || '', data: obj.data };
  } catch (e) {
    alert('町の あいことばが 読めませんでした。\n' + e.message);
    history.replaceState(null, '', location.pathname);
  }
}
await import('./main.js');
