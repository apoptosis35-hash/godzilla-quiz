// Roster: fully playable kaiju + locked (in development) slots. Locked slots cannot be selected.
import gorvath from './gorvath.js';
import vespera from './vespera.js';
import trivern from './trivern.js';
import kurogane from './kurogane.js';

export const ROSTER = [gorvath, vespera, trivern, kurogane];

export const LOCKED = [
  { id: 'l1', name: '???', type: '宇宙結晶怪獣' },
  { id: 'l2', name: '???', type: '微小体融合怪獣' },
  { id: 'l3', name: '???', type: 'サイボーグ怪獣' },
  { id: 'l4', name: '???', type: '巨大蛾怪獣' },
  { id: 'l5', name: '???', type: '植物融合怪獣' },
  { id: 'l6', name: '???', type: '甲殻装甲怪獣' },
  { id: 'l7', name: '???', type: '翼竜型怪獣' },
  { id: 'l8', name: '???', type: '再生細胞怪獣' },
  { id: 'l9', name: '???', type: '古代原種怪獣' },
  { id: 'l10', name: '???', type: '深海怪獣' },
  { id: 'l11', name: '???', type: '雷撃怪獣' },
  { id: 'l12', name: '???', type: '第四形態変異体' },
];
export function byId(id) { return ROSTER.find((d) => d.id === id); }
