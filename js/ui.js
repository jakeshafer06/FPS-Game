import { SKINS, hexToCss } from './skins.js';

export class UI {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'),
      startScreen: $('start-screen'),
      pauseScreen: $('pause-screen'),
      gameoverScreen: $('gameover-screen'),
      armoryScreen: $('armory-screen'),
      startBtn: $('start-btn'),
      armoryBtn: $('armory-btn'),
      armoryBtnGo: $('armory-btn-go'),
      armoryBackBtn: $('armory-back-btn'),
      resumeBtn: $('resume-btn'),
      restartBtn: $('restart-btn'),
      restartBtnPause: $('restart-btn-pause'),
      menuBtn: $('menu-btn'),
      menuBtnPause: $('menu-btn-pause'),
      modeSelect: $('mode-select'),
      skinGrid: $('skin-grid'),
      healthFill: $('health-fill'),
      healthNum: $('health-num'),
      ammo: $('ammo'),
      reloadHint: $('reload-hint'),
      score: $('score'),
      coinsNum: $('coins-num'),
      multInfo: $('mult-info'),
      multNum: $('mult-num'),
      timerInfo: $('timer-info'),
      timerNum: $('timer-num'),
      bossBar: $('boss-bar'),
      bossName: $('boss-name'),
      bossFill: $('boss-fill'),
      abilityBar: $('ability-bar'),
      overdriveTint: $('overdrive-tint'),
      waveNum: $('wave-num'),
      waveLabel: document.querySelector('#wave-info .hud-label'),
      enemiesLeft: $('enemies-left'),
      crosshair: $('crosshair'),
      hitmarker: $('hitmarker'),
      damageFlash: $('damage-flash'),
      waveBanner: $('wave-banner'),
      waveBannerTitle: $('wave-banner-title'),
      waveBannerSub: $('wave-banner-sub'),
      killToast: $('kill-toast'),
      goKicker: $('go-kicker'),
      goTitle: $('go-title'),
      goMode: $('go-mode'),
      goScore: $('go-score'),
      goWave: $('go-wave'),
      goWaveLabel: $('go-wave-label'),
      goKills: $('go-kills'),
      goCoins: $('go-coins'),
      goBest: $('go-best'),
      sensRange: $('sens-range'),
      sensVal: $('sens-val'),
      volRange: $('vol-range'),
      volVal: $('vol-val'),
      musicToggle: $('music-toggle'),
      touchControls: $('touch-controls'),
      stickBase: $('stick-base'),
      stickNub: $('stick-nub'),
      fireBtn: $('fire-btn'),
      jumpBtn: $('jump-btn'),
      saveNote: document.querySelector('.save-note'),
    };
    this.abilityEls = {};
    for (const el of this.el.abilityBar.querySelectorAll('.ability')) {
      this.abilityEls[el.dataset.ability] = { root: el, fill: el.querySelector('.ab-fill'), cd: el.querySelector('.ab-cd') };
    }
    this.touchAbilityEls = Array.from(document.querySelectorAll('.t-ab'));

    this._hitmarkerT = null;
    this._toastT = null;
    this._bannerT = null;
    this._crosshairT = null;
    this._lastReady = { dash: true, shock: true, overdrive: true };
    this._isTouch = 'ontouchstart' in window && window.innerWidth < 900;
    document.body.classList.toggle('touch-mode', this._isTouch);
  }

  setPhase(phase) {
    const inGameHud = phase === 'playing' || phase === 'paused';
    this.el.hud.classList.toggle('hidden', !inGameHud);
    this.el.startScreen.classList.toggle('hidden', phase !== 'menu');
    this.el.armoryScreen.classList.toggle('hidden', phase !== 'armory');
    this.el.pauseScreen.classList.toggle('hidden', phase !== 'paused');
    this.el.gameoverScreen.classList.toggle('hidden', phase !== 'gameover');
    const lobby = document.getElementById('lobby-screen');
    if (lobby) lobby.classList.toggle('hidden', phase !== 'lobby');
    this.el.touchControls.classList.toggle('hidden', !(this._isTouch && phase === 'playing'));
    document.body.classList.toggle('playing', phase === 'playing');
  }

  /* ---- menu ---- */
  setModeSelected(modeId) {
    for (const card of this.el.modeSelect.querySelectorAll('.mode-card')) {
      card.classList.toggle('selected', card.dataset.mode === modeId);
    }
  }
  setBests(best) {
    for (const span of document.querySelectorAll('[data-best]')) {
      span.textContent = (best[span.dataset.best] || 0).toLocaleString('en-US');
    }
  }
  setWallet(coins) {
    for (const w of document.querySelectorAll('.wallet')) w.textContent = coins.toLocaleString('en-US');
    this.el.coinsNum.textContent = coins.toLocaleString('en-US');
  }
  setSaveWarning(show) {
    if (this.el.saveNote) this.el.saveNote.classList.toggle('hidden', !show);
  }

  /* ---- armory ---- */
  renderArmory(profile, onAction) {
    const grid = this.el.skinGrid;
    grid.innerHTML = '';
    for (const skin of SKINS) {
      const owned = profile.owned.includes(skin.id);
      const equipped = profile.equipped === skin.id;
      const card = document.createElement('div');
      card.className = 'skin-card' + (equipped ? ' equipped' : '') + (owned ? ' owned' : '');
      const accent = skin.animated ? 'conic-gradient(from 0deg, #ff2e6b, #ffb020, #39ff6e, #29e6ff, #b24dff, #ff2e6b)' : hexToCss(skin.accent);
      card.style.setProperty('--sk-body', hexToCss(skin.body));
      card.style.setProperty('--sk-accent', skin.animated ? '#ffffff' : hexToCss(skin.accent));
      let action, label;
      if (equipped) { action = null; label = 'EQUIPPED'; }
      else if (owned) { action = 'equip'; label = 'EQUIP'; }
      else { action = 'buy'; label = `BUY ◈ ${skin.price}`; }
      const afford = profile.coins >= skin.price;
      card.innerHTML = `
        <div class="skin-preview" style="--sk-glow:${skin.animated ? '#fff' : hexToCss(skin.accent)}">
          <div class="sk-body"></div><div class="sk-barrel"></div><div class="sk-grip"></div>
          <div class="sk-core" style="background:${accent}"></div>
        </div>
        <div class="skin-name">${skin.name}</div>
        <div class="skin-desc">${skin.desc}</div>
        <button class="btn btn-small ${equipped ? 'btn-ghost' : action === 'buy' && !afford ? 'btn-ghost locked' : 'btn-primary'}" ${equipped ? 'disabled' : ''} data-skin="${skin.id}" data-action="${action || ''}">${label}</button>
      `;
      const btn = card.querySelector('button');
      if (action) btn.addEventListener('click', () => onAction(action, skin));
      grid.appendChild(card);
    }
  }

  /* ---- HUD ---- */
  setHealth(h) {
    this.el.healthFill.style.width = h + '%';
    this.el.healthFill.classList.toggle('low', h <= 30);
    this.el.healthNum.textContent = Math.round(h);
  }

  setAmmo(current, mag) {
    this.el.ammo.innerHTML = `${current}<span class="ammo-mag">/ ${mag}</span>`;
    this._ammoLow = typeof current === 'number' && current <= 6 && current > 0;
    this.el.reloadHint.classList.toggle('show', this._ammoLow);
  }

  setReloading(on) {
    if (on) {
      this.el.reloadHint.textContent = 'RELOADING…';
      this.el.reloadHint.classList.add('show');
    } else {
      this.el.reloadHint.textContent = 'R — RELOAD';
      this.el.reloadHint.classList.toggle('show', this._ammoLow || false);
    }
  }

  setScore(s) { this.el.score.textContent = s.toLocaleString('en-US'); }

  setWave(w, enemies, blitz = false) {
    this.el.waveLabel.textContent = blitz ? 'SURGE' : 'WAVE';
    this.el.waveNum.textContent = w;
    this.el.enemiesLeft.textContent = `HOSTILES: ${enemies}`;
  }

  setTimer(seconds) {
    if (seconds == null) { this.el.timerInfo.classList.add('hidden'); return; }
    this.el.timerInfo.classList.remove('hidden');
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    this.el.timerNum.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    this.el.timerNum.classList.toggle('urgent', seconds <= 15);
  }

  setMultiplier(x) {
    this.el.multInfo.classList.toggle('hidden', x <= 1);
    this.el.multNum.textContent = x.toFixed(1);
  }

  setBoss(name, frac) {
    if (!name) { this.el.bossBar.classList.add('hidden'); return; }
    this.el.bossBar.classList.remove('hidden');
    this.el.bossName.textContent = name;
    this.el.bossFill.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
  }

  setAbilities(cd, ABILITIES, state) {
    for (const id in this.abilityEls) {
      const a = this.abilityEls[id];
      const total = ABILITIES[id].cd;
      const left = cd[id];
      const ready = left <= 0;
      a.fill.style.height = ready ? '0%' : (left / total) * 100 + '%';
      a.cd.textContent = ready ? '' : left.toFixed(left < 1 ? 1 : 0);
      a.root.classList.toggle('ready', ready);
      a.root.classList.toggle('active', id === 'overdrive' && state.overdrive > 0);
      if (ready && !this._lastReady[id]) {
        a.root.classList.add('pulse');
        setTimeout(() => a.root.classList.remove('pulse'), 500);
      }
      this._lastReady[id] = ready;
      const t = this.touchAbilityEls.find((el) => el.dataset.ability === id);
      if (t) t.classList.toggle('cooling', !ready);
    }
  }
  abilityUsed(id) {
    const a = this.abilityEls[id];
    if (!a) return;
    a.root.classList.add('used');
    setTimeout(() => a.root.classList.remove('used'), 250);
  }
  abilityDenied(id) {
    const a = this.abilityEls[id];
    if (!a) return;
    a.root.classList.add('denied');
    setTimeout(() => a.root.classList.remove('denied'), 250);
  }
  setOverdrive(on) {
    this.el.overdriveTint.classList.toggle('show', on);
    document.body.classList.toggle('overdrive', on);
  }

  crosshairFire() {
    this.el.crosshair.classList.add('fire');
    clearTimeout(this._crosshairT);
    this._crosshairT = setTimeout(() => this.el.crosshair.classList.remove('fire'), 90);
  }

  hitmarker(killed) {
    this.el.hitmarker.classList.add('show');
    this.el.hitmarker.classList.toggle('kill', killed);
    clearTimeout(this._hitmarkerT);
    this._hitmarkerT = setTimeout(() => this.el.hitmarker.classList.remove('show'), 120);
  }

  damageFlash() {
    this.el.damageFlash.classList.add('show');
    setTimeout(() => this.el.damageFlash.classList.remove('show'), 60);
  }

  waveBanner(title, sub = 'INCOMING') {
    this.el.waveBannerTitle.textContent = typeof title === 'number' ? `WAVE ${title}` : title;
    this.el.waveBannerSub.textContent = sub;
    this.el.waveBanner.classList.remove('hidden');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => this.el.waveBanner.classList.add('hidden'), 2200);
  }

  killToast(text, coins = 0, big = false) {
    this.el.killToast.innerHTML = coins > 0 ? `${text} <span class="coins">◈ ${coins}</span>` : text;
    this.el.killToast.classList.add('show');
    this.el.killToast.classList.toggle('big', !!big);
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.el.killToast.classList.remove('show'), big ? 1600 : 900);
  }

  setGameOverLabels(labels) {
    const ls = this.el.gameoverScreen.querySelectorAll('.stats-row .stat .hud-label');
    labels.forEach((t, i) => { if (ls[i]) ls[i].textContent = t; });
  }

  setGameOver({ mode, score, wave, kills, coins, best, extracted, blitz }) {
    this.setGameOverLabels(['SCORE', blitz ? 'SURGE' : mode.id === 'overlord' ? 'WARDENS' : 'WAVE', 'KILLS', 'COINS EARNED']);
    this.el.restartBtn.textContent = 'REDEPLOY';
    this.el.restartBtn.disabled = false;
    this.el.goKicker.textContent = extracted ? 'EXTRACTION COMPLETE' : 'SIGNAL LOST';
    this.el.goTitle.textContent = extracted ? 'OPERATOR EXTRACTED' : 'SYSTEM FAILURE';
    this.el.goTitle.classList.toggle('go-title', !extracted);
    this.el.goTitle.classList.toggle('go-title-good', extracted);
    this.el.goMode.textContent = `${mode.name} — ${mode.tag}`;
    this.el.goScore.textContent = score.toLocaleString('en-US');
    this.el.goWaveLabel.textContent = blitz ? 'SURGE' : mode.id === 'overlord' ? 'WARDENS' : 'WAVE';
    this.el.goWave.textContent = wave;
    this.el.goKills.textContent = kills;
    this.el.goCoins.textContent = `+${coins}`;
    this.el.goBest.textContent = score >= best && score > 0 ? 'NEW PERSONAL BEST' : `BEST ${best.toLocaleString('en-US')}`;
    this.el.goBest.classList.toggle('new-best', score >= best && score > 0);
  }
}
