// assets.js — предзагрузка векторных SVG-ассетов для Canvas 2D и UI

const ASSET_MANIFEST = {
  ark_hull: 'assets/svg/ark_hull.svg',
  comp_reactor: 'assets/svg/comp_reactor.svg',
  comp_life_support: 'assets/svg/comp_life_support.svg',
  comp_hydroponics: 'assets/svg/comp_hydroponics.svg',
  comp_synthesizer: 'assets/svg/comp_synthesizer.svg',
  comp_defense_bay: 'assets/svg/comp_defense_bay.svg',
  comp_medbay: 'assets/svg/comp_medbay.svg',
  comp_shuttle_bay: 'assets/svg/comp_shuttle_bay.svg',
  node_nebula: 'assets/svg/node_nebula.svg',
  node_asteroid: 'assets/svg/node_asteroid.svg',
  node_comet: 'assets/svg/node_comet.svg',
  node_wreck: 'assets/svg/node_wreck.svg',
  node_capsule: 'assets/svg/node_capsule.svg',
  ship_shuttle: 'assets/svg/ship_shuttle.svg',
  ship_ark_top: 'assets/svg/ship_ark_top.svg',
  threat_marines: 'assets/svg/threat_marines.svg',
  threat_dreadnought: 'assets/svg/threat_dreadnought.svg',
  star_core: 'assets/svg/star_core.svg'
};

export class AssetStore {
  constructor() {
    this.images = new Map();
    this.paths = ASSET_MANIFEST;
  }

  async loadAll() {
    const entries = Object.entries(ASSET_MANIFEST);
    await Promise.all(entries.map(([key, src]) => new Promise(resolve => {
      const img = new Image();
      img.onload = () => { this.images.set(key, img); resolve(); };
      img.onerror = () => { console.warn('SVG asset failed:', src); resolve(); };
      img.src = src;
    })));
  }

  get(key) {
    const img = this.images.get(key);
    return (img && img.complete && img.naturalWidth > 0) ? img : null;
  }

  path(key) {
    return this.paths[key] || '';
  }
}
