export class UI {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      startScreen: document.getElementById('start-screen'),
      pauseScreen: document.getElementById('pause-screen'),
      gameoverScreen: document.getElementById('gameover-screen'),
      startBtn: document.getElementById('start-btn'),
      resumeBtn: document.getElementById('resume-btn'),
      restartBtn: document.getElementById('restart-btn'),
      restartBtnPause: document.getElementById('restart-btn-pause'),
      healthFill: document.getElementById('health-fill'),
      healthNum: document.getElementById('health-num'),
      ammo: document.getElementById('ammo'),
      reloadHint: document.getElementById('reload-hint'),
      score: document.getElementById('score'),
      waveNum: document.getElementById('wave-num'),
      enemiesLeft: document.getElementById('enemies-left'),
      crosshair: document.getElementById('crosshair'),
      hitmarker: document.getElementById('hitmarker'),
      damageFlash: document.getElementById('damage-flash'),
      waveBanner: document.getElementById('wave-banner'),
      waveBannerTitle: document.getElementById('wave-banner-title'),
      waveBannerSub: document.getElementById('wave-banner-sub'),
      killToast: document.getElementById('kill-toast'),
      goScore: document.getElementById('go-score'),
      goWave: document.getElementById('go-wave'),
      goKills: document.getElementById('go-kills'),
      sensRange: document.getElementById('sens-range'),
      sensVal: document.getElementById('sens-val'),
      volRange: document.getElementById('vol-range'),
      volVal: document.getElementById('vol-val'),
      musicToggle: document.getElementById('music-toggle'),
      touchControls: document.getElementById('touch-controls'),
      stickBase: document.getElementById('stick-base'),
      stickNub: document.getElementById('stick-nub'),
      fireBtn: document.getElementById('fire-btn'),
      jumpBtn: document.getElementById('jump-btn'),
    };

    this._hitmarkerT = null;
    this._toastT = null;
    this._bannerT = null;
    this._crosshairT = null;
    this._isTouch = 'ontouchstart' in window && window.innerWidth < 900;
  }

  setPhase(phase) {
    this.el.hud.classList.toggle('hidden', phase === 'menu');
    this.el.startScreen.classList.toggle('hidden', phase !== 'menu');
    this.el.pauseScreen.classList.toggle('hidden', phase !== 'paused');
    this.el.gameoverScreen.classList.toggle('hidden', phase !== 'gameover');
    this.el.touchControls.classList.toggle('hidden', !(this._isTouch && phase === 'playing'));
    document.body.classList.toggle('playing', phase === 'playing');
  }

  setHealth(h) {
    this.el.healthFill.style.width = h + '%';
    this.el.healthFill.classList.toggle('low', h <= 30);
    this.el.healthNum.textContent = Math.round(h);
  }

  setAmmo(current, mag) {
    this.el.ammo.innerHTML = `${current}<span class="ammo-mag">/ ${mag}</span>`;
    this._ammoLow = current <= 6 && current > 0;
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

  setScore(s) {
    this.el.score.textContent = s.toLocaleString('en-US');
  }

  setWave(w, enemies) {
    this.el.waveNum.textContent = w;
    this.el.enemiesLeft.textContent = `HOSTILES: ${enemies}`;
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

  waveBanner(wave, sub = 'INCOMING') {
    this.el.waveBannerTitle.textContent = `WAVE ${wave}`;
    this.el.waveBannerSub.textContent = sub;
    this.el.waveBanner.classList.remove('hidden');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => this.el.waveBanner.classList.add('hidden'), 2200);
  }

  killToast(text) {
    this.el.killToast.textContent = text;
    this.el.killToast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.el.killToast.classList.remove('show'), 900);
  }

  setGameOver(score, wave, kills) {
    this.el.goScore.textContent = score.toLocaleString('en-US');
    this.el.goWave.textContent = wave;
    this.el.goKills.textContent = kills;
  }
}
