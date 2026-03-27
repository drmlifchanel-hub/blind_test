const QUESTIONS = window.BLINDTEST_QUESTIONS || [];
const STORAGE_KEY = 'blindtest_v10_tableur_logique_state';
const CHANNEL_NAME = 'blindtest_v10_tableur_logique_sync';
const DEFAULT_MEDIA_URL = 'http://MacBook-Pro-de-Clement.local:8787';

const defaultState = {
  title: 'Blind Test Anniversaire',
  subtitle: 'Pilotage selon le tableur',
  questionIndex: 0,
  mediaServerUrl: DEFAULT_MEDIA_URL,
  lastUpdated: Date.now(),
  teams: [
    {id:'merguez',name:'Merguez',color:'#8B5CF6',score:0,pending:0},
    {id:'camaro',name:'Camaro',color:'#22C55E',score:0,pending:0},
    {id:'monaco',name:'Monaco',color:'#3B82F6',score:0,pending:0},
    {id:'amnesia',name:'Amnesia',color:'#FACC15',score:0,pending:0}
  ],
  history: []
};

const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
let toastTimeout = null;

function clone(o){ return JSON.parse(JSON.stringify(o)); }
function esc(s=''){ return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;"); }
function randomId(){ return window.crypto?.randomUUID ? window.crypto.randomUUID() : 'id-'+Math.random().toString(36).slice(2)+Date.now(); }
function fmtDate(ts){ return new Date(ts).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'medium'}); }

function migrateState(input){
  const s = Object.assign(clone(defaultState), input || {});
  s.teams = Array.isArray(s.teams) && s.teams.length ? s.teams : clone(defaultState.teams);
  s.teams = s.teams.map((t,i)=>({
    ...clone(defaultState.teams[i] || {}),
    ...t,
    pending: Number(t.pending || 0),
    score: Number(t.score || 0)
  }));
  s.history = Array.isArray(s.history) ? s.history : [];
  if(!s.mediaServerUrl) s.mediaServerUrl = DEFAULT_MEDIA_URL;
  if(typeof s.questionIndex !== 'number') s.questionIndex = 0;
  if(s.questionIndex < 0) s.questionIndex = 0;
  if(s.questionIndex >= QUESTIONS.length && QUESTIONS.length) s.questionIndex = QUESTIONS.length - 1;
  return s;
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrateState(JSON.parse(raw)) : clone(defaultState);
  }catch{
    return clone(defaultState);
  }
}
let state = loadState();

if(channel){
  channel.onmessage = (e)=>{
    if(e.data?.type === 'state'){
      state = migrateState(e.data.state);
      render();
    }
  };
}
window.addEventListener('storage', e=>{
  if(e.key === STORAGE_KEY && e.newValue){
    state = migrateState(JSON.parse(e.newValue));
    render();
  }
});

function currentQuestion(){ return QUESTIONS[state.questionIndex] || null; }
function saveState(broadcast=true){
  state.lastUpdated = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if(broadcast && channel) channel.postMessage({type:'state', state});
  render();
}
function ranking(){ return [...state.teams].sort((a,b)=>b.score-a.score); }
function totalPoints(){ return state.teams.reduce((a,t)=>a+Number(t.score||0),0); }

function usedCount(value){
  return state.teams.filter(t => Number(t.pending || 0) === Number(value)).length;
}
function remainingCount(value){
  const q = currentQuestion();
  if(!q) return 0;
  const budget = Number(q.budget[String(value)] || 0);
  return budget - usedCount(value);
}
function setPending(teamId, value){
  const team = state.teams.find(t => t.id === teamId);
  if(!team) return;
  const q = currentQuestion();
  if(!q) return;

  value = Number(value);
  const prev = Number(team.pending || 0);

  if(value === prev){
    team.pending = 0;
    saveState();
    return;
  }

  if(value === 0){
    team.pending = 0;
    saveState();
    return;
  }

  const remaining = remainingCount(value) + (prev === value ? 1 : 0);
  if(remaining <= 0){
    toast('Plus de place pour ' + value + ' point');
    return;
  }

  team.pending = value;
  saveState();

  if(q.single_auto && value > 0){
    validateCurrentQuestion();
  }
}
function resetPending(){
  state.teams.forEach(t => t.pending = 0);
  saveState();
}
function nextQuestion(){
  if(state.questionIndex < QUESTIONS.length - 1){
    state.questionIndex += 1;
  }
  state.teams.forEach(t => t.pending = 0);
}
function prevQuestion(){
  if(state.questionIndex > 0){
    state.questionIndex -= 1;
  }
  state.teams.forEach(t => t.pending = 0);
  saveState();
}
function validateCurrentQuestion(){
  const q = currentQuestion();
  if(!q) return;

  const allocations = state.teams
    .filter(t => Number(t.pending || 0) !== 0)
    .map(t => ({teamName:t.name, delta:Number(t.pending)}));

  if(!allocations.length){
    toast('Aucun point à valider');
    return;
  }

  state.teams.forEach(t => {
    t.score = Number((Number(t.score || 0) + Number(t.pending || 0)).toFixed(2));
  });

  state.history.unshift({
    id: randomId(),
    question: q.label,
    allocations,
    ts: Date.now()
  });

  nextQuestion();
  saveState();
  toast('Validé, question suivante chargée');
}
function undoLastValidation(){
  const item = state.history.shift();
  if(!item) return;
  (item.allocations || []).forEach(a => {
    const t = state.teams.find(x => x.name === a.teamName);
    if(t) t.score = Number((Number(t.score || 0) - Number(a.delta || 0)).toFixed(2));
  });
  if(state.questionIndex > 0) state.questionIndex -= 1;
  state.teams.forEach(t => t.pending = 0);
  saveState();
}
function resetAll(){
  state.teams.forEach(t => { t.score = 0; t.pending = 0; });
  state.history = [];
  state.questionIndex = 0;
  saveState();
}

async function pingMedia(){
  const base = (state.mediaServerUrl || '').trim().replace(/\/$/, '');
  if(!base) return {ok:false, message:'Adresse manquante'};
  try{
    const res = await fetch(base + '/health');
    if(!res.ok) throw new Error();
    const data = await res.json();
    return {ok:true, message:'Connecté à ' + (data.host || 'Mac')};
  }catch{
    return {ok:false, message:'Bridge indisponible'};
  }
}
async function mediaCommand(action, value){
  const base = (state.mediaServerUrl || '').trim().replace(/\/$/, '');
  if(!base) return alert('Adresse du bridge manquante');
  try{
    const res = await fetch(base + '/command', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action, value})
    });
    const data = await res.json();
    if(!res.ok || !data.ok) throw new Error(data.message || 'Erreur');
    toast(data.message || 'Commande envoyée');
  }catch(err){
    alert('Commande QuickTime impossible : ' + (err.message || err));
  }
}
function toast(msg){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(()=>el.classList.add('hidden'), 1800);
}

function renderBudgetBadges(q){
  const order = ['1','0.5','0.25'];
  return order
    .filter(v => Number(q.budget[v] || 0) > 0)
    .map(v => `<div class="badge">${v} pt : reste ${remainingCount(Number(v))}/${q.budget[v]}</div>`)
    .join('');
}
function renderChoiceButtons(team){
  const q = currentQuestion();
  const options = [0];
  ['1','0.5','0.25'].forEach(v => {
    if(Number(q.budget[v] || 0) > 0) options.push(Number(v));
  });
  return options.map(v => {
    const selected = Number(team.pending || 0) === Number(v);
    let disabled = false;
    if(v !== 0 && !selected && remainingCount(v) <= 0) disabled = true;
    return `<button class="btn small choice ${selected ? 'active primary' : 'ghost'} ${disabled ? 'disabled' : ''}" data-team="${team.id}" data-value="${v}" ${disabled ? 'disabled' : ''}>${v}</button>`;
  }).join('');
}
function render(){
  const q = currentQuestion();
  const leader = ranking()[0];
  document.getElementById('app').innerHTML = `
    <div class="card hero">
      <div class="hero-top">
        <div>
          <h1>${esc(state.title)}</h1>
          <div class="sub">${esc(state.subtitle)}</div>
        </div>
        <div class="toolbar">
          <button class="btn ghost" id="undoValidationBtn">Annuler validation</button>
          <button class="btn danger" id="resetBtn">Reset</button>
        </div>
      </div>
      <div class="row">
        <div class="question-banner">
          <div>
            <label>Question chargée depuis le tableur</label>
            <input type="text" value="${q ? esc(q.label) : 'Aucune question'}" disabled>
          </div>
          <div class="budget-line">
            ${q ? renderBudgetBadges(q) : '<div class="badge">Pas de question</div>'}
          </div>
          <div class="note">
            ${q && q.single_auto
              ? 'Question à point unique : un clic sur une équipe valide automatiquement et charge la suivante.'
              : 'Question multi-points : tu attribues les valeurs, puis tu valides.'}
          </div>
        </div>
        <div>
          <label>Adresse bridge QuickTime</label>
          <input id="mediaUrlInput" type="text" value="${esc(state.mediaServerUrl)}">
          <div class="toolbar" style="margin-top:10px">
            <button class="btn ghost" id="prevQuestionBtn">Question précédente</button>
            <button class="btn warn" id="resetPendingBtn">Remettre à 0</button>
            <button class="btn success" id="validateBtn">Valider</button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="kpis">
        <div class="kpi"><div class="label">Question</div><div class="value">${q ? q.number : '—'}</div></div>
        <div class="kpi"><div class="label">Manche</div><div class="value">${q ? esc((q.round || '').replace('Manche ','M')) : '—'}</div></div>
        <div class="kpi"><div class="label">Leader</div><div class="value">${leader ? esc(leader.name) : '—'}</div></div>
        <div class="kpi"><div class="label">Points validés</div><div class="value">${totalPoints()}</div></div>
      </div>
    </div>

    <div class="panel">
      <h2>Attribution — ${q ? esc(q.label) : 'Fin du questionnaire'}</h2>
      <div class="team-grid">
        ${state.teams.map(team => `
          <div class="card team-card">
            <div class="team-bar" style="background:${team.color}"></div>
            <div class="team-head">
              <div class="team-name">${esc(team.name)}</div>
              <div class="team-scores">
                <div class="mini-label">Validé</div>
                <div class="team-score">${team.score}</div>
                <div class="mini-label">Pour cette question</div>
                <div class="team-pending">${team.pending}</div>
              </div>
            </div>
            <div class="alloc-row">
              ${q ? renderChoiceButtons(team) : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="panel">
      <h2>QuickTime</h2>
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <div id="mediaStatus" class="pill"><span class="dot"></span><span>État inconnu</span></div>
        <button class="btn ghost" id="testBridgeBtn">Tester bridge</button>
      </div>
      <div class="toolbar">
        <button class="btn primary media-btn" data-action="playpause">Lecture / pause</button>
        <button class="btn ghost media-btn" data-action="previous">Précédent</button>
        <button class="btn ghost media-btn" data-action="next">Suivant</button>
        <button class="btn ghost media-btn" data-action="mute">Mute</button>
        <button class="btn ghost media-btn" data-action="volume-down">Volume -</button>
        <button class="btn primary media-btn" data-action="volume-up">Volume +</button>
      </div>
    </div>

    <div class="panel">
      <h2>Historique des validations</h2>
      <div class="log">
        ${state.history.length ? state.history.map(item => `
          <div class="log-item">
            <div class="log-top"><span>${esc(item.question)}</span><span>${(item.allocations || []).map(a => `${a.teamName} ${a.delta > 0 ? '+' : ''}${a.delta}`).join(' • ')}</span></div>
            <div class="log-meta">${fmtDate(item.ts)}</div>
          </div>
        `).join('') : `<div class="log-item"><div class="log-meta">Aucune validation.</div></div>`}
      </div>
    </div>

    <div class="sticky-bottom">
      <div class="bottom-bar">
        <button class="btn ghost" id="bottomResetPendingBtn">Remettre à 0</button>
        <button class="btn primary" id="bottomPlayBtn">Play / Pause</button>
        <button class="btn success" id="bottomValidateBtn">Valider</button>
      </div>
    </div>

    <div id="toast" class="pill toast hidden"></div>
  `;
  bind();
  refreshMediaStatus();
}
function bind(){
  document.getElementById('mediaUrlInput')?.addEventListener('change', e => {
    state.mediaServerUrl = e.target.value.trim();
    saveState();
    refreshMediaStatus();
  });
  document.getElementById('undoValidationBtn')?.addEventListener('click', undoLastValidation);
  document.getElementById('resetBtn')?.addEventListener('click', () => confirm('Tout remettre à zéro ?') && resetAll());
  document.getElementById('resetPendingBtn')?.addEventListener('click', resetPending);
  document.getElementById('bottomResetPendingBtn')?.addEventListener('click', resetPending);
  document.getElementById('validateBtn')?.addEventListener('click', validateCurrentQuestion);
  document.getElementById('bottomValidateBtn')?.addEventListener('click', validateCurrentQuestion);
  document.getElementById('prevQuestionBtn')?.addEventListener('click', prevQuestion);
  document.getElementById('testBridgeBtn')?.addEventListener('click', refreshMediaStatus);
  document.getElementById('bottomPlayBtn')?.addEventListener('click', () => mediaCommand('playpause'));

  document.querySelectorAll('.choice').forEach(btn => {
    btn.addEventListener('click', () => setPending(btn.dataset.team, btn.dataset.value));
  });
  document.querySelectorAll('.media-btn').forEach(btn => {
    btn.addEventListener('click', () => mediaCommand(btn.dataset.action));
  });
}
async function refreshMediaStatus(){
  const el = document.getElementById('mediaStatus');
  if(!el) return;
  el.className = 'pill';
  el.innerHTML = '<span class="dot"></span><span>Test…</span>';
  const res = await pingMedia();
  el.className = 'pill ' + (res.ok ? 'ok' : 'bad');
  el.innerHTML = '<span class="dot"></span><span>' + esc(res.message) + '</span>';
}
render();
