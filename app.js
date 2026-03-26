const STORAGE_KEY = 'blindtest_v2026_state';
const CHANNEL_NAME = 'blindtest-sync-2026';

const defaultState = {
  title: 'Blind Test Anniversaire',
  subtitle: 'Scoreboard + écran public + télécommande',
  questionLabel: 'Question 1',
  revealedAnswer: '',
  timerSeconds: 12,
  timerRemaining: 12,
  timerRunning: false,
  timerEndsAt: null,
  lastUpdated: Date.now(),
  mediaServerUrl: 'http://172.20.10.9:8787',
  teams: [
    {
      id: 'merguez',
      name: 'Équipe Merguez',
      color: '#8B5CF6',
      chef: 'Candice',
      members: ['Emeline','Albino','Fille d’Albino','Emeric','Noémie','Mathieu','Candice','Manu','Silvia','Antoine Peguet'],
      score: 0
    },
    {
      id: 'camaro',
      name: 'Équipe Camaro',
      color: '#22C55E',
      chef: 'Arnaldo',
      members: ['Soline','Copain de Soline','Pauline','Sophie','Arnaldo','Sandra Monteiro','Brice Ferhat','Enzo','Yann'],
      score: 0
    },
    {
      id: 'monaco',
      name: 'Équipe Monaco',
      color: '#3B82F6',
      chef: 'Maxime',
      members: ['Pascal','Martine','Kahan','Emma','Gabrielle','Maxime','Laura','Denis','Marie','Antoine Vigier'],
      score: 0
    },
    {
      id: 'amnesia',
      name: 'Équipe Amnesia',
      color: '#FACC15',
      chef: 'Aurélien',
      members: ['Sandrine','Roch','Nelly','Jean-Louis','Sandra Martinez','Aurélien','Véronique Monteiro','Véronique'],
      score: 0
    }
  ],
  history: []
};

const params = new URLSearchParams(location.search);
const mode = params.get('view') === 'public' ? 'public' : 'control';

const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
let timerInterval = null;

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return clone(defaultState);
    const parsed = JSON.parse(raw);
    return migrateState(parsed);
  }catch{
    return clone(defaultState);
  }
}

function migrateState(s){
  const state = Object.assign(clone(defaultState), s || {});
  state.teams = Array.isArray(state.teams) && state.teams.length ? state.teams : clone(defaultState.teams);
  state.history = Array.isArray(state.history) ? state.history : [];
  if (typeof state.timerSeconds !== 'number') state.timerSeconds = 12;
  if (typeof state.timerRemaining !== 'number') state.timerRemaining = state.timerSeconds;
  return state;
}

let state = loadState();

function saveState(broadcast = true){
  state.lastUpdated = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if(broadcast && channel) channel.postMessage({ type:'state', state });
  render();
}

if(channel){
  channel.onmessage = (event) => {
    if(event.data?.type === 'state'){
      state = migrateState(event.data.state);
      render();
    }
  };
}

window.addEventListener('storage', (e) => {
  if(e.key === STORAGE_KEY && e.newValue){
    state = migrateState(JSON.parse(e.newValue));
    render();
  }
});

function escapeHtml(str=''){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function formatDate(ts){
  return new Date(ts).toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'medium' });
}

function getRanking(){
  return [...state.teams].sort((a,b) => b.score - a.score);
}

function totalPoints(){
  return state.teams.reduce((acc, team) => acc + Number(team.score || 0), 0);
}

function addPoints(teamId, points, reason=''){
  const team = state.teams.find(t => t.id === teamId);
  if(!team) return;
  team.score += Number(points);
  state.history.unshift({
    id: cryptoRandomId(),
    teamId,
    teamName: team.name,
    delta: Number(points),
    reason: reason || state.questionLabel || '',
    question: state.questionLabel || '',
    ts: Date.now()
  });
  saveState();
}

function setQuestionLabel(value){
  state.questionLabel = value || '';
  saveState();
}

function setRevealedAnswer(value){
  state.revealedAnswer = value || '';
  saveState();
}

function resetScores(){
  state.teams.forEach(t => t.score = 0);
  state.history = [];
  state.timerRemaining = state.timerSeconds;
  state.timerRunning = false;
  state.timerEndsAt = null;
  state.questionLabel = 'Question 1';
  state.revealedAnswer = '';
  saveState();
}

function undoLast(){
  const item = state.history.shift();
  if(!item) return;
  const team = state.teams.find(t => t.id === item.teamId);
  if(team){
    team.score -= Number(item.delta);
  }
  saveState();
}

function removeHistoryItem(id){
  const idx = state.history.findIndex(h => h.id === id);
  if(idx === -1) return;
  const item = state.history[idx];
  const team = state.teams.find(t => t.id === item.teamId);
  if(team) team.score -= Number(item.delta);
  state.history.splice(idx,1);
  saveState();
}

function nextQuestion(){
  const m = String(state.questionLabel || '').match(/^(.*?)(\d+)\s*$/);
  if(m){
    state.questionLabel = `${m[1]}${Number(m[2]) + 1}`;
  }else{
    state.questionLabel = (state.questionLabel ? state.questionLabel + ' ' : 'Question ') + '1';
  }
  state.revealedAnswer = '';
  saveState();
}

function setTimerSeconds(seconds){
  const safe = Math.max(1, Number(seconds || 12));
  state.timerSeconds = safe;
  if(!state.timerRunning) state.timerRemaining = safe;
  saveState();
}

function syncTimerFromState(){
  if(timerInterval) clearInterval(timerInterval);
  if(!state.timerRunning || !state.timerEndsAt) return;
  timerInterval = setInterval(() => {
    const remainingMs = state.timerEndsAt - Date.now();
    const remain = Math.max(0, Math.ceil(remainingMs / 1000));
    if(remain !== state.timerRemaining){
      state.timerRemaining = remain;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if(channel) channel.postMessage({ type:'state', state });
      render();
    }
    if(remainingMs <= 0){
      state.timerRunning = false;
      state.timerEndsAt = null;
      state.timerRemaining = 0;
      saveState();
      beep();
      clearInterval(timerInterval);
    }
  }, 250);
}

function startTimer(){
  state.timerRunning = true;
  state.timerEndsAt = Date.now() + (Number(state.timerRemaining || state.timerSeconds) * 1000);
  saveState();
  syncTimerFromState();
}

function pauseTimer(){
  if(!state.timerRunning) return;
  const remain = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
  state.timerRemaining = remain;
  state.timerRunning = false;
  state.timerEndsAt = null;
  saveState();
  syncTimerFromState();
}

function resetTimer(){
  state.timerRunning = false;
  state.timerEndsAt = null;
  state.timerRemaining = state.timerSeconds;
  saveState();
  syncTimerFromState();
}

function beep(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    o.stop(ctx.currentTime + 0.42);
  }catch{}
}

function exportScoresCsv(){
  const rows = [
    ['Equipe','Chef','Couleur','Points','Membres'],
    ...state.teams.map(t => [t.name, t.chef, t.color, t.score, t.members.join(' | ')])
  ];
  downloadCsv(`blindtest_scores_${dateForFile()}.csv`, rows);
}

function exportHistoryCsv(){
  const rows = [
    ['Date','Equipe','Delta','Question','Raison'],
    ...[...state.history].reverse().map(h => [formatDate(h.ts), h.teamName, h.delta, h.question || '', h.reason || ''])
  ];
  downloadCsv(`blindtest_historique_${dateForFile()}.csv`, rows);
}

function downloadCsv(filename, rows){
  const csv = rows.map(r => r.map(v => {
    const s = String(v ?? '');
    return /[;"\n,]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s;
  }).join(';')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportBackupJson(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `blindtest_backup_${dateForFile()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importJsonFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      state = migrateState(data);
      saveState();
    }catch(err){
      alert('Import JSON invalide');
    }
  };
  reader.readAsText(file, 'utf-8');
}

function importScoresCsv(file){
  const reader = new FileReader();
  reader.onload = () => {
    const txt = String(reader.result || '');
    const rows = txt.split(/\r?\n/).filter(Boolean).map(line => line.split(/[;,]/));
    if(rows.length < 2){
      alert('CSV vide ou invalide');
      return;
    }
    const header = rows[0].map(c => c.trim().toLowerCase());
    const idxTeam = header.findIndex(h => h.includes('equipe') || h.includes('équipe'));
    const idxPoints = header.findIndex(h => h.includes('point'));
    if(idxTeam === -1 || idxPoints === -1){
      alert('Le CSV doit contenir au moins les colonnes Equipe et Points');
      return;
    }
    let updated = 0;
    rows.slice(1).forEach(r => {
      const teamName = (r[idxTeam] || '').trim().toLowerCase();
      const points = Number(String(r[idxPoints] || '').replace(',', '.'));
      const team = state.teams.find(t => t.name.toLowerCase() === teamName);
      if(team && !Number.isNaN(points)){
        team.score = points;
        updated++;
      }
    });
    saveState();
    alert(`${updated} équipe(s) mise(s) à jour`);
  };
  reader.readAsText(file, 'utf-8');
}

function cryptoRandomId(){
  if(window.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now();
}

function dateForFile(){
  return new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
}

async function pingMediaServer(){
  const url = (state.mediaServerUrl || '').trim().replace(/\/$/, '');
  if(!url) return { ok:false, message:'Adresse manquante' };
  try{
    const res = await fetch(url + '/health');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return { ok:true, message:`Connecté à ${data.host || 'Mac'}` };
  }catch(err){
    return { ok:false, message:'Bridge Mac indisponible' };
  }
}

async function sendMediaCommand(action, value){
  const url = (state.mediaServerUrl || '').trim().replace(/\/$/, '');
  if(!url){
    alert('Adresse du bridge Mac manquante');
    return;
  }
  try{
    const res = await fetch(url + '/command', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ action, value })
    });
    const data = await res.json();
    if(!res.ok || !data.ok) throw new Error(data.message || 'Erreur');
    toast(data.message || 'Commande envoyée');
  }catch(err){
    alert('Commande Mac impossible : ' + (err.message || err));
  }
}

let toastTimeout;
function toast(message){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.add('hidden'), 1800);
}

function renderControlView(){
  const ranking = getRanking();
  const leader = ranking[0];
  return `
    <div class="card hero">
      <div>
        <h1>${escapeHtml(state.title)}</h1>
        <div class="sub">${escapeHtml(state.subtitle)}</div>
      </div>
      <div class="toolbar">
        <button class="btn ghost" id="openPublicBtn">Ouvrir écran public</button>
        <button class="btn ghost" id="exportScoresBtn">Export scores CSV</button>
        <button class="btn ghost" id="exportHistoryBtn">Export historique CSV</button>
        <button class="btn ghost" id="backupBtn">Sauvegarde JSON</button>
        <button class="btn danger" id="resetBtn">Remise à zéro</button>
      </div>
    </div>

    <div class="layout">
      <section class="left">
        <div class="card panel">
          <h2>Pilotage du jeu</h2>
          <div class="stack">
            <div class="row">
              <div>
                <label class="small">Titre</label>
                <input id="titleInput" type="text" value="${escapeHtml(state.title)}" />
              </div>
              <div>
                <label class="small">Sous-titre</label>
                <input id="subtitleInput" type="text" value="${escapeHtml(state.subtitle)}" />
              </div>
            </div>
            <div class="row">
              <div>
                <label class="small">Question / manche</label>
                <input id="questionInput" type="text" value="${escapeHtml(state.questionLabel)}" />
              </div>
              <div>
                <label class="small">Réponse révélée</label>
                <input id="answerInput" type="text" value="${escapeHtml(state.revealedAnswer)}" placeholder="titre / artiste / film..." />
              </div>
            </div>
            <div class="row3">
              <button class="btn primary" id="nextQuestionBtn">Question suivante</button>
              <button class="btn ghost" id="undoBtn">Annuler dernier point</button>
              <button class="btn ghost" id="toggleAnswerBtn">${state.revealedAnswer ? 'Masquer/révéler réponse' : 'Préparer réponse'}</button>
            </div>
          </div>
        </div>

        <div class="card panel">
          <div class="spread">
            <h2>Timer</h2>
            <div class="pill"><span class="dot"></span><span>${state.timerRunning ? 'En cours' : 'À l’arrêt'}</span></div>
          </div>
          <div class="stack">
            <div class="row">
              <div>
                <label class="small">Durée par défaut (secondes)</label>
                <input id="timerSecondsInput" type="number" min="1" step="1" value="${state.timerSeconds}" />
              </div>
              <div>
                <label class="small">Temps restant</label>
                <input type="text" value="${state.timerRemaining}s" disabled />
              </div>
            </div>
            <div class="row3">
              <button class="btn primary" id="timerStartBtn">${state.timerRunning ? 'Relancer' : 'Démarrer'}</button>
              <button class="btn ghost" id="timerPauseBtn">Pause</button>
              <button class="btn warn" id="timerResetBtn">Reset</button>
            </div>
            <div class="small">Par défaut, on repart sur le timing qu’on avait prévu pour le blind test : 12 secondes.</div>
          </div>
        </div>

        <div class="card panel">
          <h2>Import / export</h2>
          <div class="stack">
            <div class="row">
              <div>
                <label class="small">Importer une sauvegarde JSON</label>
                <input id="jsonImportInput" type="file" accept=".json,application/json" />
              </div>
              <div>
                <label class="small">Importer un CSV scores Excel-compatible</label>
                <input id="csvImportInput" type="file" accept=".csv,text/csv" />
              </div>
            </div>
            <div class="small">Pour le CSV, garde une colonne <strong>Equipe</strong> et une colonne <strong>Points</strong>. Excel exporte ça sans souci.</div>
          </div>
        </div>

        <div class="card panel">
          <div class="spread">
            <h2>Contrôle du Mac</h2>
            <div id="mediaStatus" class="pill"><span class="dot"></span><span>État inconnu</span></div>
          </div>
          <div class="stack">
            <div class="row">
              <div style="grid-column:1 / -1">
                <label class="small">Bridge Mac local</label>
                <input id="mediaServerInput" type="text" value="${escapeHtml(state.mediaServerUrl)}" placeholder="http://172.20.10.9:8787" />
              </div>
            </div>
            <div class="row3">
              <button class="btn ghost" id="mediaPingBtn">Tester la connexion</button>
              <button class="btn primary media-btn" data-action="playpause">Lecture / pause</button>
              <button class="btn ghost media-btn" data-action="mute">Mute</button>
            </div>
            <div class="row3">
              <button class="btn ghost media-btn" data-action="previous">Piste précédente</button>
              <button class="btn ghost media-btn" data-action="next">Piste suivante</button>
              <button class="btn ghost media-btn" data-action="volume-down">Volume -</button>
            </div>
            <div class="row3">
              <button class="btn primary media-btn" data-action="volume-up">Volume +</button>
              <button class="btn ghost media-set-btn" data-value="30">Vol. 30%</button>
              <button class="btn ghost media-set-btn" data-value="60">Vol. 60%</button>
            </div>
          </div>
          <div class="footer-note">GitHub Pages sert l’interface. Le volume et la lecture du Mac passent obligatoirement par le bridge Node local.</div>
        </div>
      </section>

      <section class="right">
        <div class="card panel">
          <div class="kpis">
            <div class="kpi"><div class="small">Leader actuel</div><div class="value">${leader ? escapeHtml(leader.name.replace('Équipe ','')) : '—'}</div></div>
            <div class="kpi"><div class="small">Meilleur score</div><div class="value">${leader ? leader.score : 0}</div></div>
            <div class="kpi"><div class="small">Points distribués</div><div class="value">${totalPoints()}</div></div>
            <div class="kpi"><div class="small">Dernière mise à jour</div><div class="value" style="font-size:18px">${formatDate(state.lastUpdated)}</div></div>
          </div>
        </div>

        <div class="team-grid">
          ${state.teams.map(team => `
            <div class="team-card">
              <div class="color-bar" style="background:${team.color}"></div>
              <div class="team-head">
                <div>
                  <div class="team-name">${escapeHtml(team.name)}</div>
                  <div class="team-meta">Chef : ${escapeHtml(team.chef)} • ${team.members.length} pers.</div>
                </div>
                <div class="score">${team.score}</div>
              </div>
              <div class="points-grid">
                ${[-1, 0.25, 0.5, 1, 2].map(v => `<button class="btn ${v > 0 ? 'primary' : 'ghost'} small add-points-btn" data-team="${team.id}" data-points="${v}">${v > 0 ? '+' : ''}${v}</button>`).join('')}
              </div>
              <div class="members">
                ${team.members.map(m => `<div>${escapeHtml(m)}</div>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="card panel">
          <div class="spread">
            <h2>Historique des points</h2>
            <div class="small">${state.history.length} ligne(s)</div>
          </div>
          <div class="log">
            ${state.history.length ? state.history.map(item => `
              <div class="log-item">
                <div class="log-top">
                  <span>${escapeHtml(item.teamName)}</span>
                  <span>${item.delta > 0 ? '+' : ''}${item.delta}</span>
                </div>
                <div class="log-meta">${escapeHtml(item.question || '')}${item.reason && item.reason !== item.question ? ' • ' + escapeHtml(item.reason) : ''} • ${formatDate(item.ts)}</div>
                <div style="margin-top:10px">
                  <button class="btn ghost small remove-history-btn" data-id="${item.id}">Supprimer cette ligne</button>
                </div>
              </div>
            `).join('') : `<div class="small">Aucun point enregistré pour l’instant.</div>`}
          </div>
        </div>

        <div class="card panel">
          <h2>Classement</h2>
          <table class="table">
            <thead>
              <tr><th>#</th><th>Équipe</th><th>Chef</th><th>Points</th></tr>
            </thead>
            <tbody>
              ${ranking.map((team, i) => `
                <tr>
                  <td>${i+1}</td>
                  <td>${escapeHtml(team.name)}</td>
                  <td>${escapeHtml(team.chef)}</td>
                  <td><strong>${team.score}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer-note">Les noms d’équipes et participants sont préchargés d’après ce qu’on avait déjà posé ensemble, mais tu peux encore modifier le JSON si tu veux peaufiner.</div>
        </div>
      </section>
    </div>

    <div id="toast" class="pill hidden" style="position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99;background:#22324a;color:#fff;border:none"></div>
  `;
}

function renderPublicView(){
  const ranking = getRanking();
  const leader = ranking[0];
  const revealVisible = !!state.revealedAnswer;
  return `
    <div class="public-wrap">
      <div class="public-top">
        <div>
          <div class="public-title">${escapeHtml(state.title)}</div>
          <div class="public-sub">${escapeHtml(state.subtitle)}</div>
        </div>
        <div class="timer">
          <div class="num">${state.timerRemaining}</div>
          <div class="lab">${state.timerRunning ? 'secondes restantes' : 'timer prêt'}</div>
        </div>
      </div>

      <div>
        <div class="spread" style="margin-bottom:16px">
          <div class="public-question">${escapeHtml(state.questionLabel || '')}</div>
          ${revealVisible ? `<div class="reveal">Réponse : ${escapeHtml(state.revealedAnswer)}</div>` : `<div class="reveal">Réponse masquée</div>`}
        </div>

        <div class="public-grid">
          ${state.teams.map(team => `
            <div class="public-team">
              <div style="height:10px;border-radius:999px;background:${team.color}"></div>
              <div class="name">${escapeHtml(team.name)}</div>
              <div class="pts">${team.score}</div>
              <div class="roster">
                ${team.members.map(m => `<div>${escapeHtml(m)}</div>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="public-bottom">
        <div>${leader ? 'En tête : ' + escapeHtml(leader.name) + ' — ' + leader.score + ' pts' : 'Blind test prêt'}</div>
        <div>${formatDate(state.lastUpdated)}</div>
      </div>
    </div>
  `;
}

function render(){
  document.body.className = mode === 'public' ? 'public-body' : '';
  document.getElementById('app').innerHTML = mode === 'public' ? renderPublicView() : renderControlView();
  bindEvents();
  syncTimerFromState();
  if(mode !== 'public') refreshMediaStatus();
}

function bindEvents(){
  if(mode === 'public') return;

  const $ = (id) => document.getElementById(id);

  $('openPublicBtn')?.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('view', 'public');
    window.open(url.toString(), '_blank');
  });

  $('exportScoresBtn')?.addEventListener('click', exportScoresCsv);
  $('exportHistoryBtn')?.addEventListener('click', exportHistoryCsv);
  $('backupBtn')?.addEventListener('click', exportBackupJson);
  $('resetBtn')?.addEventListener('click', () => {
    if(confirm('Remettre tous les scores et l’historique à zéro ?')) resetScores();
  });

  $('titleInput')?.addEventListener('input', e => { state.title = e.target.value; saveState(); });
  $('subtitleInput')?.addEventListener('input', e => { state.subtitle = e.target.value; saveState(); });
  $('questionInput')?.addEventListener('input', e => setQuestionLabel(e.target.value));
  $('answerInput')?.addEventListener('input', e => setRevealedAnswer(e.target.value));

  $('nextQuestionBtn')?.addEventListener('click', nextQuestion);
  $('undoBtn')?.addEventListener('click', undoLast);
  $('toggleAnswerBtn')?.addEventListener('click', () => {
    if(state.revealedAnswer){
      const current = state.revealedAnswer;
      state.revealedAnswer = current.startsWith('[HIDDEN] ') ? current.replace('[HIDDEN] ','') : '[HIDDEN] ' + current;
      saveState();
    } else {
      alert('Renseigne d’abord une réponse dans le champ prévu.');
    }
  });

  $('timerSecondsInput')?.addEventListener('change', e => setTimerSeconds(Number(e.target.value)));
  $('timerStartBtn')?.addEventListener('click', startTimer);
  $('timerPauseBtn')?.addEventListener('click', pauseTimer);
  $('timerResetBtn')?.addEventListener('click', resetTimer);

  $('jsonImportInput')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if(file) importJsonFile(file);
  });
  $('csvImportInput')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if(file) importScoresCsv(file);
  });

  $('mediaServerInput')?.addEventListener('change', e => {
    state.mediaServerUrl = e.target.value.trim();
    saveState();
    refreshMediaStatus();
  });
  $('mediaPingBtn')?.addEventListener('click', refreshMediaStatus);

  document.querySelectorAll('.media-btn').forEach(btn => {
    btn.addEventListener('click', () => sendMediaCommand(btn.dataset.action));
  });
  document.querySelectorAll('.media-set-btn').forEach(btn => {
    btn.addEventListener('click', () => sendMediaCommand('set-volume', Number(btn.dataset.value)));
  });

  document.querySelectorAll('.add-points-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const teamId = btn.dataset.team;
      const points = Number(btn.dataset.points);
      const reason = prompt('Motif / détail du point (optionnel)', state.questionLabel || '') || state.questionLabel || '';
      addPoints(teamId, points, reason);
    });
  });

  document.querySelectorAll('.remove-history-btn').forEach(btn => {
    btn.addEventListener('click', () => removeHistoryItem(btn.dataset.id));
  });
}

async function refreshMediaStatus(){
  const el = document.getElementById('mediaStatus');
  if(!el) return;
  el.className = 'pill';
  el.innerHTML = '<span class="dot"></span><span>Test en cours...</span>';
  const result = await pingMediaServer();
  el.className = 'pill ' + (result.ok ? 'ok' : 'bad');
  el.innerHTML = `<span class="dot"></span><span>${escapeHtml(result.message)}</span>`;
}

render();
syncTimerFromState();
